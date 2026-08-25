const SESSION_COOKIE = "__Host-rlm-session";
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
const MINIMUM_SECRET_LENGTH = 32;
const SESSION_CONTEXT = "cloudflare-computer-rlm-session";

export async function authorizeAgentRequest(
  request: Request,
  expectedToken: string | undefined,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (isLoopback(url.hostname)) return null;

  const expected = strongSecret(expectedToken);
  if (!expected) return missingSecretResponse();

  const supplied = readCookie(request, SESSION_COOKIE);
  if (!(await validSessionCookie(supplied, expected))) {
    return Response.json(
      { error: "Demo session is not authorized." },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }
  return null;
}

export async function handleSessionRequest(
  request: Request,
  expectedToken: string | undefined,
): Promise<Response> {
  const url = new URL(request.url);
  if (isLoopback(url.hostname)) {
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  }

  const expected = strongSecret(expectedToken);
  if (!expected) return missingSecretResponse();

  if (request.method === "GET") {
    return (
      (await authorizeAgentRequest(request, expected)) ??
      new Response(null, { status: 204, headers: { "cache-control": "no-store" } })
    );
  }
  if (request.method !== "POST") {
    return new Response(null, {
      status: 405,
      headers: { allow: "GET, POST", "cache-control": "no-store" },
    });
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 4096) {
    return Response.json(
      { error: "Request is too large." },
      { status: 413, headers: { "cache-control": "no-store" } },
    );
  }

  const body = await request.json().catch(() => null);
  const supplied =
    body !== null && typeof body === "object" && "token" in body && typeof body.token === "string"
      ? body.token
      : "";
  if (!constantTimeEqual(supplied, expected)) {
    return Response.json(
      { error: "Invalid demo token." },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  return new Response(null, {
    status: 204,
    headers: {
      "cache-control": "no-store",
      "set-cookie": `${SESSION_COOKIE}=${await createSessionCookie(expected)}; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Strict`,
    },
  });
}

function strongSecret(value: string | undefined): string | null {
  const secret = value?.trim() ?? "";
  return secret.length >= MINIMUM_SECRET_LENGTH ? secret : null;
}

function missingSecretResponse(): Response {
  return Response.json(
    {
      error: `Set DEMO_TOKEN to a secret of at least ${MINIMUM_SECRET_LENGTH} characters before exposing this example.`,
    },
    { status: 503, headers: { "cache-control": "no-store" } },
  );
}

async function createSessionCookie(secret: string): Promise<string> {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
  const signature = await signSession(secret, expiresAt);
  return `${expiresAt}.${signature}`;
}

async function validSessionCookie(cookie: string, secret: string): Promise<boolean> {
  const separator = cookie.indexOf(".");
  if (separator <= 0) return false;
  const expiresText = cookie.slice(0, separator);
  const signature = cookie.slice(separator + 1);
  if (!/^\d+$/.test(expiresText)) return false;
  const expiresAt = Number(expiresText);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return false;
  return constantTimeEqual(signature, await signSession(secret, expiresAt));
}

async function signSession(secret: string, expiresAt: number): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${SESSION_CONTEXT}:${expiresAt}`),
  );
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function readCookie(request: Request, name: string): string {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) {
      try {
        return decodeURIComponent(value.join("="));
      } catch {
        return "";
      }
    }
  }
  return "";
}

function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function constantTimeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let mismatch = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return mismatch === 0;
}
