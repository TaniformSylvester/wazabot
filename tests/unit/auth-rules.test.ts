import { describe, expect, it } from "vitest";

import { workspaceSetupPath } from "@/lib/auth/workspace-setup";
import { forgotPasswordSchema, inviteSignUpSchema, loginSchema, registerSchema, resetPasswordSchema, workspaceSetupSchema } from "@/lib/validation/auth";
import { authRules, businessTypeFromVertical, rulesResolver } from "@/lib/validation/auth-rules";

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

  it("names (sign-up: the account only)", async () => {
    for (const fullName of names) {
      const v = { fullName, email: "awa@shop.cm", password: "Wazabolt2026" };
      expect(await ruleFirst(authRules.register, v), fullName).toEqual(zodFirst(registerSchema, v));
    }
  });

  it("?vertical= / ?type= map to a business type; unknown values are dropped, never an error", () => {
    expect(businessTypeFromVertical("shop")).toBe("retail");
    expect(businessTypeFromVertical("Restaurant")).toBe("restaurant");
    expect(businessTypeFromVertical("schools")).toBe("school");
    expect(businessTypeFromVertical("spaceship")).toBeUndefined();
    expect(businessTypeFromVertical(undefined)).toBeUndefined();
    expect(registerSchema.parse({ fullName: "Awa Fon", email: "awa@shop.cm", password: "Wazabolt2026", vertical: "spaceship", country: "XX" })).toEqual({ fullName: "Awa Fon", email: "awa@shop.cm", password: "Wazabolt2026" });
    expect(workspaceSetupPath({ vertical: "school", country: "NG" })).toBe("/dashboard/setup?vertical=school&country=NG");
    expect(workspaceSetupPath({ vertical: "retail" })).toBe("/dashboard/setup?vertical=shop");
    expect(workspaceSetupPath({})).toBe("/dashboard/setup");
  });

  it("the workspace setup: a name, a currency (by country) and a type", () => {
    expect(workspaceSetupSchema.safeParse({ name: "Awa Styles", currency: "CM", type: "retail" }).success).toBe(true);
    const bad = workspaceSetupSchema.safeParse({ name: "A", currency: "US", type: "spaceship" });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues.map((i) => `${String(i.path[0])}:${i.message}`).sort()).toEqual(["currency:invalid_option", "name:business_required", "type:business_type_required"]);
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
