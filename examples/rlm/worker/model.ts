import type { LanguageModel } from "ai";
import { createWorkersAI } from "workers-ai-provider";

import { BENCHMARK_MODEL_ID } from "./model-id";

export type ModelEnv = Env & {
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  WORKERS_AI_USE_REST?: string;
};

export function createModel(env: ModelEnv): LanguageModel {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiKey = env.CLOUDFLARE_API_TOKEN?.trim();
  if (env.WORKERS_AI_USE_REST === "true" && accountId && apiKey) {
    return createWorkersAI({ accountId, apiKey })(BENCHMARK_MODEL_ID);
  }
  return createWorkersAI({ binding: env.AI })(BENCHMARK_MODEL_ID);
}
