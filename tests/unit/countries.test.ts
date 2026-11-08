import { describe, expect, it } from "vitest";

import { ACTIVE_COUNTRIES, getCountryPack } from "@/lib/i18n/country-packs";
import { currencyDigits, formatAmount } from "@/lib/i18n/format";
import { normalizeWhatsAppNumber } from "@/lib/validation/app";
import { registerSchema } from "@/lib/validation/auth";

const plain = (s: string) => s.replace(/[  ]/g, " ");

describe("country packs", () => {
  it("Cameroon, Zimbabwe, Nigeria, South Africa, Ghana and Kenya: currency, time zone, languages, dialling code", () => {
    expect(ACTIVE_COUNTRIES).toEqual(["CM", "ZW", "NG", "ZA", "GH", "KE"]);
    expect(getCountryPack("NG")).toMatchObject({ currency: "NGN", timezone: "Africa/Lagos", dialCode: "234", languages: ["en"] });
    expect(getCountryPack("ZA")).toMatchObject({ currency: "ZAR", timezone: "Africa/Johannesburg", dialCode: "27", languages: ["en"] });
    expect(getCountryPack("GH")).toMatchObject({ currency: "GHS", timezone: "Africa/Accra", dialCode: "233", languages: ["en"] });
    expect(getCountryPack("KE")).toMatchObject({ currency: "KES", timezone: "Africa/Nairobi", dialCode: "254", languages: ["en"] });
    expect(getCountryPack("CM")).toMatchObject({ currency: "XAF", timezone: "Africa/Douala", dialCode: "237", languages: ["en", "fr", "wes"] });
    expect(getCountryPack("ZW")).toMatchObject({ currency: "USD", timezone: "Africa/Harare", dialCode: "263", languages: ["en"] });
    expect(getCountryPack("zz").countryCode).toBe("CM");
  });

  it("sign-up: the country is chosen (Cameroon by default); an unknown one is refused", () => {
    const base = { fullName: "Tendai Moyo", businessName: "Moyo Hardware", businessType: "retail", email: "t@example.com", password: "Wazabolt2026" };
    expect(registerSchema.parse(base).country).toBe("CM");
    expect(registerSchema.parse({ ...base, country: "ZW" }).country).toBe("ZW");
    for (const c of ["NG", "ZA", "GH", "KE"]) expect(registerSchema.parse({ ...base, country: c }).country).toBe(c);
    expect(registerSchema.safeParse({ ...base, country: "FR" }).success).toBe(false);
  });
});

describe("phone numbers", () => {
  it("Cameroon: local mobile numbers get +237", () => {
    expect(normalizeWhatsAppNumber("6 70 00 00 01")).toBe("237670000001");
    expect(normalizeWhatsAppNumber("670000001", "CM")).toBe("237670000001");
    expect(normalizeWhatsAppNumber("237670000001")).toBe("237670000001");
  });

  it("Zimbabwe: 07X XXX XXXX (or without the 0) gets +263, the 0 dropped", () => {
    expect(normalizeWhatsAppNumber("077 123 4567")).toBe("263771234567");
    expect(normalizeWhatsAppNumber("0771234567", "ZW")).toBe("263771234567");
    expect(normalizeWhatsAppNumber("771234567")).toBe("263771234567");
    expect(normalizeWhatsAppNumber("263771234567")).toBe("263771234567");
  });

  it("Nigeria, South Africa, Ghana and Kenya: local mobile numbers get their country's code", () => {
    expect(normalizeWhatsAppNumber("0803 123 4567", "NG")).toBe("2348031234567");
    expect(normalizeWhatsAppNumber("8031234567", "NG")).toBe("2348031234567");
    expect(normalizeWhatsAppNumber("082 123 4567", "ZA")).toBe("27821234567");
    expect(normalizeWhatsAppNumber("27821234567", "ZA")).toBe("27821234567");
    expect(normalizeWhatsAppNumber("024 123 4567", "GH")).toBe("233241234567");
    expect(normalizeWhatsAppNumber("0712 345 678", "KE")).toBe("254712345678");
    expect(normalizeWhatsAppNumber("0110 123 456", "KE")).toBe("254110123456");
  });

  it("the same local number belongs to the business's country (07… is a mobile in Zimbabwe, Kenya and South Africa)", () => {
    expect(normalizeWhatsAppNumber("0712345678", "ZW")).toBe("263712345678");
    expect(normalizeWhatsAppNumber("0712345678", "KE")).toBe("254712345678");
    expect(normalizeWhatsAppNumber("0712345678", "ZA")).toBe("27712345678");
    // A number in another country's format, without +, isn't given the wrong code.
    expect(normalizeWhatsAppNumber("670000001", "KE")).toBe("670000001");
  });

  it("numbers with + or 00 are kept as typed, whatever the country", () => {
    expect(normalizeWhatsAppNumber("+254 712 345 678", "ZW")).toBe("254712345678");
    expect(normalizeWhatsAppNumber("+263 77 123 4567")).toBe("263771234567");
    expect(normalizeWhatsAppNumber("00237 670 000 001")).toBe("237670000001");
    expect(normalizeWhatsAppNumber("+44 7700 900123")).toBe("447700900123");
  });
});

describe("amounts", () => {
  it("FCFA without decimals; US dollars with cents", () => {
    expect(currencyDigits("XAF")).toBe(0);
    expect(currencyDigits("USD")).toBe(2);
    expect(plain(formatAmount(15000, "XAF", "en"))).toBe("15,000 FCFA");
    expect(plain(formatAmount(15000, "XAF", "fr"))).toBe("15 000 FCFA");
    expect(formatAmount(12.5, "USD", "en")).toBe("12.50 USD");
    expect(formatAmount("1234.5", "USD", "en")).toBe("1,234.50 USD");
    expect(formatAmount(3, "USD", "en")).toBe("3.00 USD");
    expect(plain(formatAmount(12.5, "USD", "fr"))).toBe("12,50 USD");
  });

  it("naira and Kenyan shillings in whole units; rand and cedi with cents", () => {
    expect(plain(formatAmount(15000, "NGN", "en"))).toBe("15,000 NGN");
    expect(plain(formatAmount(1500, "KES", "en"))).toBe("1,500 KES");
    expect(formatAmount(49.99, "ZAR", "en")).toBe("49.99 ZAR");
    expect(formatAmount(25, "GHS", "en")).toBe("25.00 GHS");
  });
});

describe("plan prices in US dollars (Zimbabwe)", () => {
  it("the plans are $5, $12 and $25 a month; yearly is 10 months for 12", async () => {
    const { catalogFor, quote } = await import("@/lib/billing/price");
    const usd = catalogFor("USD")!;
    expect(usd.plans.map((p) => [p.id, p.monthlyPrice])).toEqual([
      ["boutique", 5],
      ["business", 12],
      ["multishop", 25],
    ]);
    expect(quote("business", null, "year", usd).period).toBe(120);
    expect(quote("multishop", null, "month", usd).period).toBe(25);
    expect(plain(formatAmount(quote("boutique", null, "year", usd).period, "USD", "en"))).toBe("50.00 USD");
  });

  it("only the plans are sold in dollars: no AI add-on or bundle; FCFA is unchanged; an unpriced currency gets nothing", async () => {
    const { catalog, catalogFor, quote } = await import("@/lib/billing/price");
    const usd = catalogFor("USD")!;
    expect(usd.addons).toEqual([]);
    expect(usd.bundles).toEqual([]);
    expect(() => quote("business", "ai_basic", "month", usd)).toThrow();
    expect(catalogFor("XAF")).toBe(catalog);
    expect(quote("business", null, "month", catalogFor("XAF")!).period).toBe(7500);
    // Outside Cameroon, every business pays its plan in US dollars, whatever its shop's currency.
    for (const c of ["NGN", "ZAR", "GHS", "KES", "EUR"]) expect(catalogFor(c)?.plans.map((p) => p.monthlyPrice)).toEqual([5, 12, 25]);
  });

  it("the team's margin report counts a dollar plan in FCFA", async () => {
    const { businessMargin } = await import("@/lib/billing/margins");
    const { FCFA_PER_USD } = await import("@/config/economics");
    const r = {
      business_id: "b1",
      business_name: "Moyo Hardware",
      plan_id: "business",
      subscription_status: "active",
      claude_reply_fcfa: 0,
      claude_test_fcfa: 0,
      claude_usd: 0,
      claude_requests: 0,
      ai_conversations: 0,
      service_sent: 0,
      service_over_free: 0,
      utility_sent: 0,
      marketing_sent: 0,
    };
    expect(businessMargin(r, "month", null, "USD").revenue).toBe(12 * FCFA_PER_USD);
    expect(businessMargin(r, "year", null, "USD").revenue).toBeCloseTo((120 / 12) * FCFA_PER_USD);
    expect(businessMargin(r, "month", null, "XAF").revenue).toBe(7500);
  });
});
