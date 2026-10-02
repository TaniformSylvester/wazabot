import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { withImages } from "@/lib/ai/claude";
import { ImageRejectedError, prepareImage } from "@/lib/ai/images";

describe("prepareImage (customer photos)", () => {
  it("re-encodes to JPEG within 1568 px, keeping the aspect ratio", async () => {
    const png = await sharp({ create: { width: 4000, height: 2000, channels: 4, background: { r: 200, g: 30, b: 30, alpha: 0.5 } } }).png().toBuffer();
    const img = await prepareImage(png);
    expect(img.mediaType).toBe("image/jpeg");
    const meta = await sharp(Buffer.from(img.data, "base64")).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(1568);
    expect(meta.height).toBe(784);
  });

  it("leaves small photos at their size", async () => {
    const jpg = await sharp({ create: { width: 320, height: 480, channels: 3, background: "#c0392b" } }).jpeg().toBuffer();
    const meta = await sharp(Buffer.from((await prepareImage(jpg)).data, "base64")).metadata();
    expect([meta.width, meta.height]).toEqual([320, 480]);
  });

  it("refuses bytes that aren't an image, and oversized uploads", async () => {
    await expect(prepareImage(new TextEncoder().encode("<script>not a photo</script>"))).rejects.toBeInstanceOf(ImageRejectedError);
    await expect(prepareImage(new Uint8Array(9 * 1024 * 1024))).rejects.toMatchObject({ reason: "too_large" });
  });
});

describe("withImages", () => {
  const image = { mediaType: "image/jpeg" as const, data: "AAAA" };

  it("puts the photo before the text of the customer's latest turn", () => {
    const turns = withImages(
      [
        { role: "user", content: "Bonjour" },
        { role: "assistant", content: "Bonjour !" },
        { role: "user", content: "[photo] Vous avez ça ?" },
      ],
      [image],
    );
    expect(turns).toHaveLength(3);
    expect(turns[2]).toEqual({
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AAAA" } },
        { type: "text", text: "[photo] Vous avez ça ?" },
      ],
    });
  });

  it("leaves the conversation unchanged without photos", () => {
    const turns = [{ role: "user" as const, content: "Bonjour" }];
    expect(withImages(turns, [])).toBe(turns);
  });
});
