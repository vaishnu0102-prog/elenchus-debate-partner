// Parse a fetch() Response body as Server-Sent Events, yielding each event's data string.
async function* readSSE(res) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const data = chunk.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart()).join("\n");
        if (data) yield data;
      }
    }
  } finally {
    try { reader.releaseLock(); } catch (_) {}
  }
}
module.exports = { readSSE };
