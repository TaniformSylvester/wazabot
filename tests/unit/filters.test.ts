import { describe, expect, it } from "vitest";

import { isEmojiOnly, spamReason } from "@/lib/ai/filters";

const now = new Date("2026-10-05T10:00:00Z");
const at = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000).toISOString();

describe("messages Claude doesn't read", () => {
  it("spots emoji-only messages, not short words or numbers", () => {
    for (const t of ["👍", "🙏🏾🙏🏾", "❤️ !", "😂😂😂 ..."]) expect(isEmojiOnly(t)).toBe(true);
    for (const t of ["ok", "2", "Merci 🙏", "oui 👍", ""]) expect(isEmojiOnly(t)).toBe(false);
  });

  it("spots repeats within the window, pastes and link floods", () => {
    expect(spamReason("C'est combien ?", [{ text: "c'est  combien ?", at: at(3) }], now)).toBe("repeat");
    expect(spamReason("C'est combien ?", [{ text: "c'est combien ?", at: at(30) }], now)).toBeNull();
    expect(spamReason("x".repeat(2001), [], now)).toBe("too_long");
    expect(spamReason("win http://a.io http://b.io www.c.io", [], now)).toBe("links");
    expect(spamReason("Voici la photo du modèle: https://instagram.com/p/x", [], now)).toBeNull();
  });
});
