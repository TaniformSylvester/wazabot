import { describe, expect, it } from "vitest";

import { forgotPasswordSchema, inviteSignUpSchema, loginSchema, registerSchema, resetPasswordSchema } from "@/lib/validation/auth";
import { authRules, rulesResolver } from "@/lib/validation/auth-rules";

/*
 * The browser's sign-in/sign-up checks (no Zod, to keep those pages light)
 * must agree with the Server Actions' Zod schemas: same verdict, same first
 * message per field. For email the browser is only allowed to be looser
 * (the server then answers); never stricter.
 */

const zodFirst = (schema: { safeParse: (v: unknown) => { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } } }, values: Record<string, unknown>) => {
  const r = schema.safeParse(values);
  const out: Record<string, string> = {};
  for (const i of r.error?.issues ?? []) {
    const k = String(i.path[0]);
    out[k] ??= i.message;
  }
  return out;
};
const ruleFirst = async (rules: Parameters<typeof rulesResolver>[0], values: Record<string, unknown>) => {
  const res = await rulesResolver(rules)(values, undefined, { fields: {}, shouldUseNativeValidation: false });
  return Object.fromEntries(Object.entries(res.errors).map(([k, e]) => [k, String((e as { message?: string }).message)]));
};

const passwords = ["", "short1", "abcdefgh", "12345678", "abcdefg1", "Wazabolt2026", "a".repeat(71) + "1", "a".repeat(72) + "1", "        ", "pässwörd9"];
const names = ["", " ", "A", " A ", "Al", "Awa Fon", "x".repeat(120), "x".repeat(121)];
const emails = ["", " ", "awa", "awa@", "awa@shop", "awa@shop.cm", " Awa@Shop.CM ", "a b@shop.cm", "awa@shop.co.uk", "awa@@shop.cm"];

describe("browser sign-up/sign-in checks agree with the server's", () => {
  it("passwords (sign-up): the same first message for every case", async () => {
    for (const password of passwords) {
      expect(await ruleFirst(authRules.inviteSignUp, { fullName: "Awa Fon", password }), password).toEqual(zodFirst(inviteSignUpSchema, { fullName: "Awa Fon", password }));
    }
  });

  it("names and business type (sign-up)", async () => {
    for (const fullName of names) {
      for (const businessType of ["retail", "school", "", "spaceship"]) {
        const v = { fullName, businessName: fullName, businessType, email: "awa@shop.cm", password: "Wazabolt2026" };
        expect(await ruleFirst(authRules.register, v), `${fullName}/${businessType}`).toEqual(zodFirst(registerSchema, v));
      }
    }
  });

  it("emails: never stricter than the server (anything the server accepts passes here too)", async () => {
    for (const email of emails) {
      const server = zodFirst(forgotPasswordSchema, { email });
      const browser = await ruleFirst(authRules.forgotPassword, { email });
      if (!server.email) expect(browser.email, email).toBeUndefined();
      if (browser.email) expect(server.email, email).toBe("email_invalid");
    }
  });

  it("login: a password is required; a valid login passes", async () => {
    for (const v of [{ email: "awa@shop.cm", password: "" }, { email: "awa@shop.cm", password: "x" }, { email: "", password: "" }]) {
      expect(await ruleFirst(authRules.login, v)).toEqual(zodFirst(loginSchema, v));
    }
  });

  it("new password: the confirmation must match", async () => {
    for (const [password, confirmPassword] of [["Wazabolt2026", "Wazabolt2026"], ["Wazabolt2026", "Wazabolt2027"], ["short", "other"], ["", ""]]) {
      expect(await ruleFirst(authRules.resetPassword, { password, confirmPassword })).toEqual(zodFirst(resetPasswordSchema, { password, confirmPassword }));
    }
  });
});
