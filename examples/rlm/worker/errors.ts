export function isContextLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /context (?:length|limit|window)|maximum context|prompt (?:is )?too long|input (?:is )?too long|token limit exceeded|request too large/i.test(
    message,
  );
}

export function directContextError(error: unknown): string {
  if (!isContextLimitError(error)) return userFacingError(error);
  return `Direct context unsupported: the provider rejected this sample because it exceeds the model context limit. ${userFacingError(error)}`;
}

export function userFacingError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/capacity temporarily exceeded|code["']?:\s*3040/i.test(message)) {
    return "Workers AI returned model-capacity error 3040. This is provider-side capacity for the selected model, not an account quota. Retry later or choose another fixed example model.";
  }
  if (/429 Too Many Requests/i.test(message)) {
    return "Workers AI rate-limited the request. Check account limits and retry later.";
  }
  if (/too many redirects|cloudflareaccess\.com|workers-binding\.ai/i.test(message)) {
    return "Workers AI could not be reached. Check Wrangler authentication and the AI binding, then retry.";
  }
  const withoutUrls = message.replace(/https?:\/\/\S+/g, "[remote URL]");
  return withoutUrls.length > 500 ? `${withoutUrls.slice(0, 497)}…` : withoutUrls;
}
