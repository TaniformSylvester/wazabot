/*
 * A scripted local stand-in for the Anthropic Messages API, for end-to-end
 * tests only (no network, no cost). Point the app at it with
 * ANTHROPIC_BASE_URL=http://localhost:4020 and any ANTHROPIC_API_KEY.
 *
 * It plays a simple French-speaking shop assistant that uses the real tools:
 *   "combien" / "prix"        → searchProducts, then quotes the catalog price
 *   "je prends N"             → searchProducts, createOrder, then confirms the order
 *   "parler à quelqu'un"      → send_reply with needs_human
 *   a photo                   → searchProducts, viewProductPhotos, then "we have it"
 *   anything else             → a greeting
 */
import { createServer } from "node:http";

const usage = { input_tokens: 1200, output_tokens: 60, cache_read_input_tokens: 900, cache_creation_input_tokens: 0 };

// The latest customer turn: plain text, or [image…, text] when they sent a photo (tool results don't count).
const lastCustomerTurn = (messages) => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user") continue;
    if (typeof m.content === "string") return { text: m.content.split("\n\n").at(-1), images: [] };
    if (m.content.some((b) => b.type === "tool_result")) continue;
    return { text: m.content.filter((b) => b.type === "text").map((b) => b.text).join(" "), images: m.content.filter((b) => b.type === "image") };
  }
  return { text: "", images: [] };
};
const lastCustomerText = (messages) => lastCustomerTurn(messages).text;
const toolResults = (messages) => {
  const out = {};
  const byId = {};
  for (const m of messages) {
    if (m.role === "assistant" && Array.isArray(m.content)) for (const b of m.content) if (b.type === "tool_use") byId[b.id] = b.name;
    if (m.role === "user" && Array.isArray(m.content)) {
      for (const b of m.content) {
        if (b.type !== "tool_result" || b.is_error) continue;
        // Most results are JSON text; viewProductPhotos returns [text, image, …].
        if (typeof b.content === "string") out[byId[b.tool_use_id]] = JSON.parse(b.content);
        else out[byId[b.tool_use_id]] = { ...JSON.parse(b.content[0].text), images: b.content.filter((c) => c.type === "image").length };
      }
    }
  }
  return out;
};
const sendReply = (fields) => ({
  type: "tool_use",
  id: `toolu_${Math.random().toString(36).slice(2)}`,
  name: "send_reply",
  input: { reply_language: "fr", customer_languages: ["fr"], language_request: null, catalog_product_ids: [], needs_human: false, handoff_reason: null, ...fields },
});
const call = (name, input) => ({ type: "tool_use", id: `toolu_${Math.random().toString(36).slice(2)}`, name, input });

function respond(body) {
  const text = lastCustomerText(body.messages).toLowerCase();
  const results = toolResults(body.messages);
  const product = results.searchProducts?.[0];
  const order = results.createOrder;

  // A customer photo: describe → search the catalog → compare with its photos → answer.
  if (lastCustomerTurn(body.messages).images.length) {
    if (!product) return [call("searchProducts", { query: "robe ankara rouge" })];
    if (product.hasPhoto && !results.viewProductPhotos) return [call("viewProductPhotos", { productIds: [product.productId] })];
    const seen = results.viewProductPhotos?.images ? " (même modèle que sur notre photo)" : "";
    return [sendReply({ reply: `Oui, nous avons cette ${product.name}${seen} : ${product.price} ${product.currency}.`, catalog_product_ids: [product.productId] })];
  }
  if (/parler à quelqu'un|un humain/.test(text)) {
    return [sendReply({ reply: "Bien sûr, je transmets votre demande à l'équipe.", needs_human: true, handoff_reason: "customer asked for a person" })];
  }
  const qty = Number(text.match(/je prends (\d+)/)?.[1] ?? 0);
  if (qty) {
    if (!product) return [call("searchProducts", { query: "Ankara" })];
    if (!order) return [call("createOrder", { items: [{ productId: product.productId, quantity: qty }] })];
    return [sendReply({ reply: `C'est noté ! Votre commande ${order.orderNumber} est enregistrée : ${order.total} ${order.currency}.`, catalog_product_ids: [product.productId] })];
  }
  if (/combien|prix/.test(text)) {
    if (!product) return [call("searchProducts", { query: "Ankara" })];
    return [sendReply({ reply: `La ${product.name} coûte ${product.price} ${product.currency}.`, catalog_product_ids: [product.productId] })];
  }
  return [sendReply({ reply: "Bonjour ! Comment puis-je vous aider ?" })];
}

export function startFakeAnthropic(port = 4020) {
  const requests = [];
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      if (!req.url.startsWith("/v1/messages")) {
        res.writeHead(404).end();
        return;
      }
      const body = JSON.parse(raw);
      requests.push({ headers: req.headers, body });
      // Simulate an API rejection (e.g. bad parameter) to test error handling.
      if (lastCustomerText(body.messages).includes("FORCE_ERROR")) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "simulated failure" } }));
        return;
      }
      const content = respond(body);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: `msg_${requests.length}`, type: "message", role: "assistant", model: body.model, content, stop_reason: "tool_use", stop_sequence: null, usage }));
    });
  });
  return new Promise((resolve) => server.listen(port, () => resolve({ close: () => server.close(), requests })));
}
