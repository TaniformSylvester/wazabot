import { describe, expect, it } from "vitest";

import { waitlistSchema } from "@/lib/validation/waitlist";
import { waitlistHref, waitlistVertical } from "@/lib/waitlist/mode";

describe("waitlist vertical", () => {
  it("reads ?vertical= and the older ?type= values", () => {
    expect(waitlistVertical("shop")).toBe("shop");
    expect(waitlistVertical("restaurants")).toBe("restaurant");
    expect(waitlistVertical("retail")).toBe("shop");
    expect(waitlistVertical("school")).toBe("school");
    expect(waitlistVertical("other")).toBeUndefined();
    expect(waitlistVertical("nonsense")).toBeUndefined();
  });

  it("links to the form with the vertical", () => {
    expect(waitlistHref("en", "restaurant")).toBe("/en/waitlist?vertical=restaurant");
    expect(waitlistHref("fr", undefined)).toBe("/fr/waitlist");
  });
});

describe("waitlist request", () => {
  const base = { businessName: "Mama Ngozi Kitchen", whatsappNumber: "6 70 00 00 00", email: "Ngozi@Example.com", vertical: "restaurant", country: "CM" };

  it("normalises the WhatsApp number and the email", () => {
    const r = waitlistSchema.safeParse(base);
    expect(r.success && r.data).toMatchObject({ whatsappNumber: "237670000000", email: "ngozi@example.com" });
  });

  it("reads a local number in the chosen country", () => {
    const r = waitlistSchema.safeParse({ ...base, whatsappNumber: "0803 123 4567", country: "NG" });
    expect(r.success && r.data.whatsappNumber).toBe("2348031234567");
  });

  it("refuses bad fields with their keys", () => {
    const r = waitlistSchema.safeParse({ ...base, businessName: "A", whatsappNumber: "12", email: "nope", vertical: "bank" });
    expect(r.success).toBe(false);
    const keys = r.success ? [] : r.error.issues.map((i) => i.message);
    expect(keys).toEqual(expect.arrayContaining(["business_name", "email", "vertical"]));
  });

  it("refuses a number too short to be one", () => {
    expect(waitlistSchema.safeParse({ ...base, whatsappNumber: "12345" }).success).toBe(false);
  });
});
