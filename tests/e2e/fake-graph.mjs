/*
 * A tiny local stand-in for Meta's Graph API (WhatsApp Cloud API), for
 * end-to-end tests only. Point the app at it with
 * WHATSAPP_GRAPH_API_BASE_URL=http://localhost:4010.
 *
 * Accepts tokens starting with "GOOD"; account 200200200 owns number 100100100.
 */
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import sharp from "sharp";

export const FAKE = { wabaId: "200200200", phoneNumberId: "100100100", otherPhoneNumberId: "100100999", display: "+237 6 99 00 00 01", verifiedName: "Awa Styles" };
// A real (small) JPEG: the assistant decodes customer photos before looking at them.
const IMAGE = await sharp({ create: { width: 320, height: 480, channels: 3, background: "#c0392b" } }).jpeg().toBuffer();

export function startFakeGraph(port = 4010) {
  const sent = [];
  const reads = [];
  const templates = [];
  let n = 0;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    const body = await new Promise((r) => {
      let b = "";
      req.on("data", (c) => (b += c));
      req.on("end", () => r(b ? JSON.parse(b) : null));
    });
    const json = (status, data) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(data));
    };
    if (url.pathname === "/__sent") return json(200, { sent, reads, templates });
    // Test hook: Meta approves every template under review.
    if (url.pathname === "/__approve") {
      for (const t of templates) if (t.status === "PENDING") t.status = "APPROVED";
      return json(200, { ok: true });
    }
    if (url.pathname === "/media/photo.jpg") {
      res.writeHead(200, { "content-type": "image/jpeg" });
      return res.end(IMAGE);
    }
    if (!(req.headers.authorization ?? "").startsWith("Bearer GOOD")) return json(401, { error: { code: 190, message: "Invalid OAuth access token" } });
    const parts = url.pathname.split("/").filter(Boolean); // [version, id, edge?]
    const [, id, edge] = parts;
    if (req.method === "GET" && edge === "phone_numbers") {
      return id === FAKE.wabaId ? json(200, { data: [{ id: FAKE.phoneNumberId }] }) : json(400, { error: { code: 100, message: "Unknown account" } });
    }
    if (req.method === "POST" && edge === "subscribed_apps") return json(200, { success: true });
    if (edge === "message_templates" && id === FAKE.wabaId) {
      if (req.method === "GET") return json(200, { data: templates.map(({ id: tid, name, language, status }) => ({ id: tid, name, language, status })) });
      if (req.method === "POST") {
        if (templates.some((t) => t.name === body.name && t.language === body.language)) return json(400, { error: { code: 100, message: "Template already exists" } });
        const t = { id: `tmpl_${templates.length + 1}`, name: body.name, language: body.language, category: body.category, components: body.components, status: "PENDING" };
        templates.push(t);
        return json(200, { id: t.id, status: "PENDING", category: body.category });
      }
    }
    if (req.method === "GET" && id === FAKE.phoneNumberId && !edge) {
      return json(200, { id, display_phone_number: FAKE.display, verified_name: FAKE.verifiedName, quality_rating: "GREEN" });
    }
    if (req.method === "POST" && edge === "messages") {
      if (body?.status === "read") {
        reads.push(body.message_id);
        return json(200, { success: true });
      }
      if (body?.to === "237699999999") return json(400, { error: { code: 131026, message: "Message undeliverable" } });
      const wamid = `wamid.OUT${++n}`;
      sent.push({ ...body, wamid });
      return json(200, { messaging_product: "whatsapp", messages: [{ id: wamid }] });
    }
    if (req.method === "GET" && id?.startsWith("media")) {
      return json(200, { url: `http://localhost:${port}/media/photo.jpg`, mime_type: "image/jpeg", file_size: IMAGE.length, sha256: createHash("sha256").update(IMAGE).digest("hex") });
    }
    json(404, { error: { code: 803, message: "Unknown path" } });
  });
  return new Promise((resolve) =>
    server.listen(port, () =>
      resolve({
        close: () => server.close(),
        sent: () => ({ sent, reads }),
        templates: () => templates,
        approveAll: () => templates.forEach((t) => (t.status = t.status === "PENDING" ? "APPROVED" : t.status)),
      }),
    ),
  );
}
