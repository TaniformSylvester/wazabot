import { describe, expect, it } from "vitest";

import { firstGap, quickReplies } from "@/lib/conversations/quick-replies";

describe("1-tap quick replies", () => {
  it("three per business type, in the right order", () => {
    expect(quickReplies("retail", "en").map((r) => r.key)).toEqual(["payment", "inStock", "deliveryEta"]);
    expect(quickReplies("other", "en").map((r) => r.key)).toEqual(["payment", "inStock", "deliveryEta"]);
    expect(quickReplies("restaurant", "en").map((r) => r.key)).toEqual(["orderConfirmed", "readyForPickup", "outForDelivery"]);
    expect(quickReplies("school", "en").map((r) => r.key)).toEqual(["feeSchedule", "campusVisit", "admissionsCall"]);
  });

  it("a reply needing a fact WazaBolt doesn't hold is a draft with a [gap], never sent on tap", () => {
    for (const industry of ["retail", "restaurant", "school"]) {
      for (const lang of ["en", "fr"]) {
        for (const r of quickReplies(industry, lang)) {
          expect(r.send && /\[/.test(r.text), `${industry}/${lang}/${r.key}`).toBe(false);
        }
      }
    }
    expect(quickReplies("retail", "en").find((r) => r.key === "payment")?.send).toBe(false);
    expect(quickReplies("retail", "en").find((r) => r.key === "deliveryEta")?.send).toBe(false);
    expect(quickReplies("restaurant", "en").every((r) => r.send)).toBe(true);
  });

  it("in the conversation's language (French, otherwise English)", () => {
    expect(quickReplies("restaurant", "fr")[1].text).toBe("Votre commande est prête, vous pouvez venir la chercher.");
    expect(quickReplies("restaurant", "pcm")[1].text).toBe("Your order is ready for pickup.");
  });

  it("a school's fee schedule comes from its fee items when there are some (a draft to check)", () => {
    const r = quickReplies("school", "en", { year: "2026–2027", items: [{ name: "Registration", amount: "10,000 FCFA" }, { name: "Tuition", amount: "50,000 FCFA" }] })[0];
    expect(r).toEqual({ key: "feeSchedule", send: false, text: "Here is our fee schedule for 2026–2027:\n• Registration: 10,000 FCFA\n• Tuition: 50,000 FCFA" });
    expect(quickReplies("school", "fr")[0].text).toContain("[montant]");
  });

  it("the first [gap] is found, to select it", () => {
    expect(firstGap("arrive around [time].")).toEqual({ start: 14, end: 20 });
    expect(firstGap("no gap")).toBeNull();
  });
});
