// Failure-path tests: AI outage must not corrupt a debate; PDFs must parse.
process.env.LLM_PROVIDER = "mock"; process.env.PORT = "0";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
let server, base, tok;
const email = `fail_${Date.now().toString(36)}@example.com`;
const call = async (m, p, body, token = tok) => { const r = await fetch(base + p, { method: m, headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: body && JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null) }; };
before(async () => {
  server = await require("../server").start(); base = `http://127.0.0.1:${server.address().port}`;
  tok = (await (await fetch(base + "/api/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Fail Test", email, password: "password123" }) })).json()).token;
});
after(async () => { await call("DELETE", "/api/me", { password: "password123" }); server.close(); await require("../src/db").pool.end(); });

test("AI failure mid-turn rolls the turn back, emits an error event, and retry works", async () => {
  const provider = require("../src/llm").getProvider();
  const origStream = provider.stream;
  const d = (await call("POST", "/api/debates", { topic: "Should zoos exist in modern society?", side: "for", difficulty: "easy", maxTurns: 2 })).body.debate;
  provider.stream = async function* () { yield "partial"; throw new Error("upstream 500"); };
  const res = await fetch(`${base}/api/debates/${d.id}/messages`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${tok}` }, body: JSON.stringify({ content: "My opening argument about zoos." }) });
  const text = await res.text();
  assert.match(text, /event: error/); assert.doesNotMatch(text, /event: done/);
  const after = (await call("GET", `/api/debates/${d.id}`)).body;
  assert.equal(after.messages.length, 0, "failed turn must be rolled back"); assert.equal(after.userTurns, 0);
  provider.stream = origStream;
  const retry = await fetch(`${base}/api/debates/${d.id}/messages`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${tok}` }, body: JSON.stringify({ content: "My opening argument about zoos." }) });
  assert.match(await retry.text(), /event: done/);
  assert.equal((await call("GET", `/api/debates/${d.id}`)).body.messages.length, 2);

  // judge outage -> degraded fallback evaluation, debate still completes
  const origComplete = provider.complete; provider.complete = async () => { throw new Error("judge down"); };
  const fin = await call("POST", `/api/debates/${d.id}/finish`);
  provider.complete = origComplete;
  assert.equal(fin.status, 200); assert.equal(fin.body.evaluation.degraded, true);
  // garbage from judge -> also degraded, never crashes
});

test("judge returning garbage JSON falls back safely", async () => {
  const provider = require("../src/llm").getProvider(); const oc = provider.complete;
  const d = (await call("POST", "/api/debates", { topic: "Should voting be mandatory?", side: "against", difficulty: "hard", maxTurns: 1 })).body.debate;
  await (await fetch(`${base}/api/debates/${d.id}/messages`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${tok}` }, body: JSON.stringify({ content: "Compulsion undermines liberty." }) })).text();
  provider.complete = async () => '{"winner":"user","overall":99}';
  const fin = await call("POST", `/api/debates/${d.id}/finish`); provider.complete = oc;
  assert.equal(fin.status, 200); assert.equal(fin.body.evaluation.degraded, true); assert.ok(fin.body.evaluation.overall <= 10);
});

test("real PDF upload is parsed into usable text", async () => {
  if (!fs.existsSync("/tmp/fact.pdf")) return; // fixture only generated in dev sandbox
  const f = new FormData(); f.append("file", new Blob([fs.readFileSync("/tmp/fact.pdf")], { type: "application/pdf" }), "fact.pdf");
  const r = await fetch(base + "/api/documents", { method: "POST", headers: { authorization: `Bearer ${tok}` }, body: f });
  const j = await r.json(); assert.equal(r.status, 201, JSON.stringify(j)); assert.ok(j.document.chars > 100);
  const { rows } = await require("../src/db").query("SELECT content FROM documents WHERE id=$1", [j.document.id]);
  assert.match(rows[0].content, /condor/i);
});
