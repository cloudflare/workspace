import { afterEach, describe, expect, it, vi } from "vitest";

import { authorizeAgentRequest, handleSessionRequest } from "./auth";

const DEMO_SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("demo session authorization", () => {
  afterEach(() => vi.useRealTimers());

  it("allows local development without a shared secret", async () => {
    await expect(
      authorizeAgentRequest(new Request("http://127.0.0.1/agents/rlm/demo"), undefined),
    ).resolves.toBe(null);
  });

  it("fails closed when a deployed demo has no strong secret", async () => {
    for (const secret of [undefined, "too-short"]) {
      const response = await authorizeAgentRequest(
        new Request("https://rlm.example.com/agents/rlm/demo"),
        secret,
      );

      expect(response?.status).toBe(503);
      await expect(response?.json()).resolves.toMatchObject({
        error: expect.stringContaining("DEMO_TOKEN"),
      });
    }
  });

  it("exchanges the configured token for a signed HttpOnly session cookie", async () => {
    const response = await openSession();
    const cookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(cookie).toContain("__Host-rlm-session=");
    expect(cookie).not.toContain(DEMO_SECRET);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Strict");
  });

  it("requires a valid signed session cookie for deployed agent routes", async () => {
    await expect(
      authorizeAgentRequest(new Request("https://rlm.example.com/agents/rlm/demo"), DEMO_SECRET),
    ).resolves.toMatchObject({ status: 401 });
    await expect(
      authorizeAgentRequest(
        new Request("https://rlm.example.com/agents/rlm/demo", {
          headers: { cookie: `__Host-rlm-session=${DEMO_SECRET}` },
        }),
        DEMO_SECRET,
      ),
    ).resolves.toMatchObject({ status: 401 });

    const cookie = await sessionCookie();
    await expect(
      authorizeAgentRequest(
        new Request("https://rlm.example.com/agents/rlm/demo", {
          headers: { cookie },
        }),
        DEMO_SECRET,
      ),
    ).resolves.toBe(null);
  });

  it("rejects an expired signed session cookie", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-21T12:00:00Z"));
    const cookie = await sessionCookie();
    vi.advanceTimersByTime(8 * 60 * 60 * 1000 + 1);

    await expect(
      authorizeAgentRequest(
        new Request("https://rlm.example.com/agents/rlm/demo", {
          headers: { cookie },
        }),
        DEMO_SECRET,
      ),
    ).resolves.toMatchObject({ status: 401 });
  });

  it("does not accept the shared token in a URL", async () => {
    await expect(
      authorizeAgentRequest(
        new Request(`https://rlm.example.com/agents/rlm/demo?token=${DEMO_SECRET}`),
        DEMO_SECRET,
      ),
    ).resolves.toMatchObject({ status: 401 });
  });
});

async function openSession(): Promise<Response> {
  return handleSessionRequest(
    new Request("https://rlm.example.com/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: DEMO_SECRET }),
    }),
    DEMO_SECRET,
  );
}

async function sessionCookie(): Promise<string> {
  const response = await openSession();
  return (response.headers.get("set-cookie") ?? "").split(";", 1)[0] ?? "";
}
