/*
 * A local stand-in for Resend's email API, for end-to-end tests only: it
 * records each email the app sends. Point the app at it with
 * RESEND_API_URL=http://localhost:4030 and any RESEND_API_KEY.
 */
import { createServer } from "node:http";

export function startFakeResend(port = 4030) {
  const emails = [];
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      if (req.method !== "POST" || req.url !== "/emails" || !String(req.headers.authorization ?? "").startsWith("Bearer ")) {
        res.writeHead(401, { "content-type": "application/json" }).end(JSON.stringify({ name: "unauthorized", message: "missing key" }));
        return;
      }
      const body = JSON.parse(raw);
      emails.push(body);
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ id: `email_${emails.length}` }));
    });
  });
  return new Promise((resolve) => server.listen(port, () => resolve({ close: () => server.close(), emails })));
}
