import { describe, expect, it } from "vitest";

import { apiErrorKind } from "@/lib/ai/test-chat";

describe("test chat: what a failed AI call means for the owner", () => {
  it("a refused key", () => {
    expect(apiErrorKind({ code: "api_401", message: "authentication_error: invalid x-api-key" })).toBe("key_invalid");
    expect(apiErrorKind({ code: "api_403", message: "permission_error: …" })).toBe("key_invalid");
  });

  it("no credit left", () => {
    expect(apiErrorKind({ code: "api_400", message: "invalid_request_error: Your credit balance is too low to access the Anthropic API." })).toBe("no_credit");
  });

  it("busy or overloaded", () => {
    for (const code of ["api_429", "api_529", "api_503", "api_500"]) expect(apiErrorKind({ code, message: "" })).toBe("busy");
  });

  it("anything else stays a plain failure", () => {
    expect(apiErrorKind({ code: "api_400", message: "invalid_request_error: something else" })).toBe("failed");
    expect(apiErrorKind({ code: "error", message: "TypeError" })).toBe("failed");
    expect(apiErrorKind({ code: "max_steps", message: "" })).toBe("failed");
  });
});
