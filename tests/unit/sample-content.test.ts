import { describe, expect, it } from "vitest";

import { sampleContent, sampleMoney, samplePrice } from "@/lib/onboarding/sample-content";

describe("sample data for a new workspace", () => {
  it("every business type: 4–6 catalogue items (subjects for a school), 2 chats with exactly 1 waiting for a person, 3 FAQ templates", () => {
    for (const industry of ["retail", "restaurant", "school", "other", null]) {
      for (const lang of ["en", "fr"]) {
        const c = sampleContent(industry, lang, "XAF");
        const items = industry === "school" ? c.subjects.length : c.products.length;
        expect(items, `${industry}/${lang}`).toBeGreaterThanOrEqual(4);
        expect(items, `${industry}/${lang}`).toBeLessThanOrEqual(6);
        expect(c.conversations).toHaveLength(2);
        expect(c.conversations.filter((x) => x.handoff)).toHaveLength(1);
        // The chat waiting for a person ends with the customer's message.
        expect(c.conversations.find((x) => x.handoff)?.messages.at(-1)?.from).toBe("customer");
        expect(c.faqs).toHaveLength(3);
      }
    }
  });

  it("the replies are the team's, never the AI assistant's (it isn't available yet)", () => {
    for (const industry of ["retail", "restaurant", "school"]) {
      const c = sampleContent(industry, "en", "XAF");
      expect(c.conversations.flatMap((x) => x.messages).every((m) => m.from === "customer" || m.from === "team")).toBe(true);
    }
  });

  it("prices follow the chosen currency, rounded the way they're charged there", () => {
    expect(samplePrice(15000, "XAF")).toBe(15000);
    expect(samplePrice(15000, "USD")).toBe(25);
    expect(samplePrice(3500, "USD")).toBe(6);
    expect(samplePrice(15000, "NGN")).toBe(39000);
    expect(samplePrice(15000, "ZAR")).toBe(450);
    expect(samplePrice(15000, "GHS")).toBe(360);
    expect(samplePrice(15000, "KES")).toBe(3150);
    // Never free.
    expect(samplePrice(100, "USD")).toBe(0.5);
    const shop = sampleContent("retail", "en", "NGN");
    expect(shop.products.every((p) => p.price > 0 && Number.isInteger(p.price / 100))).toBe(true);
  });

  it("amounts in texts are written like the rest of the app: 7,000 FCFA (en), 7 000 FCFA (fr), 12.50 USD", () => {
    expect(sampleMoney(7000, "XAF", "en")).toBe("7,000 FCFA");
    expect(sampleMoney(7000, "XAF", "fr")).toBe("7 000 FCFA");
    expect(sampleMoney(12.5, "USD", "en")).toBe("12.50 USD");
    const resto = sampleContent("restaurant", "fr", "XAF");
    expect(resto.faqs[0].answer).toContain("1 000 FCFA");
    const ng = sampleContent("restaurant", "en", "NGN");
    expect(ng.faqs[0].answer).toContain("2,600 NGN");
  });

  it("in the business's language: French for French businesses, English otherwise", () => {
    expect(sampleContent("retail", "fr", "XAF").products[0].name).toBe("Robe en wax");
    expect(sampleContent("retail", "pcm", "NGN").products[0].name).toBe("Wax print dress");
    expect(sampleContent("school", "fr", "XAF").subjects[0]).toBe("Mathématiques");
  });
});
