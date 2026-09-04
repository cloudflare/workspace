import { routeAgentRequest } from "agents";

import { authorizeAgentRequest, handleSessionRequest } from "./auth";

export { DirectAgent } from "./direct-agent";
export { ExecutorAgent } from "./executor-agent";
export { RlmAgent } from "./rlm-agent";

type DemoEnv = Env & { DEMO_TOKEN?: string };

export default {
  async fetch(request: Request, env: DemoEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response("ok\n", {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    if (url.pathname === "/api/session") {
      return handleSessionRequest(request, env.DEMO_TOKEN);
    }
    if (url.pathname.startsWith("/agents/")) {
      const denied = await authorizeAgentRequest(request, env.DEMO_TOKEN);
      if (denied) return denied;
    }
    return (await routeAgentRequest(request, env)) ?? new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<DemoEnv>;
