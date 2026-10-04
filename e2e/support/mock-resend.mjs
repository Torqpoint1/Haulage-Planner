// A stand-in for Resend during end-to-end tests: accepts emails sent with the
// test key and lets tests read them back with GET /emails?to=<address>.
import { createServer } from "node:http";

const port = Number(process.env.MOCK_RESEND_PORT ?? 3197);
const sent = [];

createServer((req, res) => {
  res.setHeader("content-type", "application/json");
  const url = new URL(req.url ?? "/", `http://localhost:${port}`);
  if (url.pathname === "/health") return res.end(JSON.stringify({ ok: true }));
  if (req.method === "GET" && url.pathname === "/emails") {
    const to = url.searchParams.get("to");
    return res.end(JSON.stringify(sent.filter((e) => !to || e.to.includes(to))));
  }
  if (req.method === "POST" && url.pathname === "/emails") {
    if (req.headers.authorization !== "Bearer re_test") {
      res.statusCode = 401;
      return res.end(JSON.stringify({ message: "Invalid API key" }));
    }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const email = JSON.parse(body);
      sent.push(email);
      res.end(JSON.stringify({ id: `email_${sent.length}` }));
    });
    return;
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ message: "Not found" }));
}).listen(port, () => console.log(`Mock Resend on ${port}`));
