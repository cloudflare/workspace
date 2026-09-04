import { describe, expect, it } from "vitest";

import { directContextError, isContextLimitError, userFacingError } from "./errors";

describe("userFacingError", () => {
  it("turns binding redirect failures into an actionable message", () => {
    expect(
      userFacingError(
        new Error(
          "Too many redirects: https://workers-binding.ai/run redirected through https://team.cloudflareaccess.com/cdn-cgi/access/login?token=secret",
        ),
      ),
    ).toBe(
      "Workers AI could not be reached. Check Wrangler authentication and the AI binding, then retry.",
    );
  });

  it("distinguishes provider model capacity from an account quota", () => {
    expect(userFacingError(new Error("429 Too Many Requests: capacity temporarily exceeded"))).toBe(
      "Workers AI returned model-capacity error 3040. This is provider-side capacity for the selected model, not an account quota. Retry later or choose another fixed example model.",
    );
  });

  it("classifies direct provider context-limit rejections as unsupported", () => {
    const error = new Error("maximum context length exceeded for this request");

    expect(isContextLimitError(error)).toBe(true);
    expect(directContextError(error)).toContain("Direct context unsupported");
    expect(isContextLimitError(new Error("authentication failed"))).toBe(false);
  });

  it("removes remote URLs and caps unexpected diagnostics", () => {
    const message = userFacingError(
      new Error(`Request failed at https://example.com/private?token=secret ${"x".repeat(800)}`),
    );

    expect(message).not.toContain("token=secret");
    expect(message).toContain("[remote URL]");
    expect(message.length).toBeLessThanOrEqual(500);
  });
});
