// Verifies the Anthropic and OpenAI-compatible adapters parse real streaming wire formats
// (served by local fake servers, since tests must not need paid API keys).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

function fakeServer(handler) {
  return new Promise((resolve) => { const s = http.createServer(handler).listen(0, () => resolve(s)); });
}
const collect = async (it) => { let out = ""; for await (const t of it) out += t; return out; };

test("anthropic adapter streams text_delta events and sends correct headers/body", async () => {
  let seen;
  const srv = await fakeServer((req, res) => {
    let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => {
      seen = { url: req.url, key: req.headers["x-api-key"], ver: req.headers["anthropic-version"], body: JSON.parse(b) };
      res.writeHead(200, { "content-type": "text/event-stream" });
      const ev = (type, d) => `event: ${type}\ndata: ${JSON.stringify({ type, ...d })}\n\n`;
      res.write(ev("message_start", { message: {} }));
      res.write(ev("content_block_delta", { index: 0, delta: { type: "text_delta", text: "Hel" } }));
      res.write(ev("ping", {}));
      const full = ev("content_block_delta", { index: 0, delta: { type: "text_delta", text: "lo wörld" } });
      res.write(full.slice(0, 20)); setTimeout(() => { res.write(full.slice(20)); res.write(ev("message_stop", {})); res.end(); }, 20); // split mid-event
    });
  });
  const p = require("../src/llm/anthropic")({ apiKey: "k-test", model: "m1", baseUrl: `http://127.0.0.1:${srv.address().port}`, timeoutMs: 5000 });
  assert.equal(await collect(p.stream({ system: "S", messages: [{ role: "user", content: "hi" }] })), "Hello wörld");
  assert.equal(seen.url, "/v1/messages"); assert.equal(seen.key, "k-test"); assert.equal(seen.ver, "2023-06-01");
  assert.equal(seen.body.model, "m1"); assert.equal(seen.body.stream, true); assert.equal(seen.body.system, "S");
  srv.close();
});

test("anthropic complete() joins text blocks; HTTP errors surface", async () => {
  const srv = await fakeServer((req, res) => { req.resume(); req.on("end", () => {
    if (req.headers["x-api-key"] === "bad") { res.writeHead(401).end('{"error":"nope"}'); return; }
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ content: [{ type: "text", text: "A" }, { type: "text", text: "B" }] })); }); });
  const mk = (k) => require("../src/llm/anthropic")({ apiKey: k, model: "m", baseUrl: `http://127.0.0.1:${srv.address().port}`, timeoutMs: 5000 });
  assert.equal(await mk("ok").complete({ system: "s", messages: [{ role: "user", content: "x" }] }), "AB");
  await assert.rejects(mk("bad").complete({ system: "s", messages: [{ role: "user", content: "x" }] }), /401/);
  srv.close();
});

test("openai-compatible adapter streams delta.content and stops at [DONE]", async () => {
  let seen;
  const srv = await fakeServer((req, res) => {
    let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => {
      seen = { url: req.url, auth: req.headers.authorization, body: JSON.parse(b) };
      res.writeHead(200, { "content-type": "text/event-stream" });
      for (const t of ["Hi", " there", "!"]) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ choices: [{ delta: {} }] })}\n\n`);
      res.write("data: [DONE]\n\n"); res.end();
    });
  });
  const p = require("../src/llm/openai")({ apiKey: "sk-x", model: "gpt-x", baseUrl: `http://127.0.0.1:${srv.address().port}/v1`, timeoutMs: 5000 });
  assert.equal(await collect(p.stream({ system: "SYS", messages: [{ role: "user", content: "yo" }] })), "Hi there!");
  assert.equal(seen.url, "/v1/chat/completions"); assert.equal(seen.auth, "Bearer sk-x");
  assert.deepEqual(seen.body.messages[0], { role: "system", content: "SYS" });
  srv.close();
});

test("aborting the signal stops a stream", async () => {
  const srv = await fakeServer((req, res) => { req.resume(); res.writeHead(200, { "content-type": "text/event-stream" }); res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "a" } }] })}\n\n`); /* never ends */ });
  const p = require("../src/llm/openai")({ apiKey: "k", model: "m", baseUrl: `http://127.0.0.1:${srv.address().port}`, timeoutMs: 5000 });
  const ac = new AbortController(); setTimeout(() => ac.abort(), 150);
  await assert.rejects(collect(p.stream({ system: "s", messages: [{ role: "user", content: "x" }], signal: ac.signal })));
  srv.closeAllConnections(); srv.close();
});
