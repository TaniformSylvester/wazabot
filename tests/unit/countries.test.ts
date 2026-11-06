import { describe, expect, it } from "vitest";

import { ACTIVE_COUNTRIES, getCountryPack } from "@/lib/i18n/country-packs";
import { currencyDigits, formatAmount } from "@/lib/i18n/format";
import { normalizeWhatsAppNumber } from "@/lib/validation/app";
import { registerSchema } from "@/lib/validation/auth";

const plain = (s: string) => s.replace(/[  ]/g, " ");

describe("country packs", () => {
  it("Cameroon and Zimbabwe: currency, time zone, languages, dialling code", () => {
    expect(ACTIVE_COUNTRIES).toEqual(["CM", "ZW"]);
    expect(getCountryPack("CM")).toMatchObject({ currency: "XAF", timezone: "Africa/Douala", dialCode: "237", languages: ["en", "fr", "wes"] });
    expect(getCountryPack("ZW")).toMatchObject({ currency: "USD", timezone: "Africa/Harare", dialCode: "263", languages: ["en"] });
    expect(getCountryPack("zz").countryCode).toBe("CM");
  });

  it("sign-up: the country is chosen (Cameroon by default); an unknown one is refused", () => {
    const base = { fullName: "Tendai Moyo", businessName: "Moyo Hardware", businessType: "retail", email: "t@example.com", password: "Wazabolt2026" };
    expect(registerSchema.parse(base).country).toBe("CM");
    expect(registerSchema.parse({ ...base, country: "ZW" }).country).toBe("ZW");
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

  it("numbers with + or 00 are kept as typed, whatever the country", () => {
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
});
