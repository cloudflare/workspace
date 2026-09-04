import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import type { Connection } from "agents";
import { streamText } from "ai";

import type { BenchmarkAgentState } from "../shared/types";
import {
  boundedSignal,
  createRun,
  initialAgentState,
  loadFixture,
  updateMetrics,
} from "./agent-common";
import { parseBenchmarkRequest } from "./benchmark";
import { directContextError, userFacingError } from "./errors";
import { scoreFixtureText } from "./fixture-types";
import { completeInference, startInference, withCombinedMetrics } from "./metrics";
import { createModel, type ModelEnv } from "./model";
import { directPrompt, directSystemPrompt, PARENT_GENERATION_SETTINGS } from "./prompts";

export class DirectAgent extends AIChatAgent<ModelEnv, BenchmarkAgentState> {
  initialState = initialAgentState("direct");
  #active = false;

  override validateStateChange(_next: BenchmarkAgentState, source: Connection | "server"): void {
    if (source !== "server") throw new Error("Benchmark state is server-owned.");
  }

  override async onChatMessage(
    _onFinish: unknown,
    options?: OnChatMessageOptions,
  ): Promise<Response> {
    const request = parseBenchmarkRequest(options?.body);
    if (this.#active) throw new Error("A Direct Context run is already active.");
    this.#active = true;
    const signal = boundedSignal(options?.abortSignal);
    const startedAtMs = Date.now();
    const startedAt = new Date(startedAtMs).toISOString();
    this.setState({
      ...this.state,
      status: "loading",
      prompt: "",
      finalAnswer: "",
      error: null,
      startedAt,
      finishedAt: null,
      run: null,
      children: [],
    });

    const fixture = await loadFixture(request.sample, signal).catch((error) => {
      this.#active = false;
      this.setState({
        ...this.state,
        status: signal.aborted ? "cancelled" : "failed",
        error: signal.aborted ? null : userFacingError(error),
        finishedAt: new Date().toISOString(),
      });
      throw error;
    });
    const prompt = directPrompt(fixture);
    let run = createRun("direct", request, fixture);
    let metrics = run.metrics;
    this.setState({
      ...this.state,
      status: "running",
      prompt: fixture.manifest.question,
      run,
    });

    const publish = () => {
      run = updateMetrics(run, metrics);
      this.setState({ ...this.state, run });
    };
    const result = streamText({
      abortSignal: signal,
      model: createModel(this.env),
      ...PARENT_GENERATION_SETTINGS,
      system: directSystemPrompt(fixture),
      prompt,
      onStepStart: () => {
        metrics = { ...metrics, parent: startInference(metrics.parent) };
        publish();
      },
      onStepEnd: ({ usage }) => {
        metrics = { ...metrics, parent: completeInference(metrics.parent, usage) };
        publish();
      },
      onFinish: ({ text }) => {
        this.#active = false;
        metrics = withCombinedMetrics({ ...metrics, durationMs: Date.now() - startedAtMs });
        run = { ...run, metrics, score: scoreFixtureText(fixture, text) };
        this.setState({
          ...this.state,
          status: "completed",
          finalAnswer: text,
          error: null,
          finishedAt: new Date().toISOString(),
          run,
        });
      },
      onError: ({ error }) => {
        this.#active = false;
        metrics = withCombinedMetrics({ ...metrics, durationMs: Date.now() - startedAtMs });
        run = { ...run, metrics };
        this.setState({
          ...this.state,
          status: "failed",
          error: directContextError(error),
          finishedAt: new Date().toISOString(),
          run,
        });
      },
      onAbort: () => {
        this.#active = false;
        metrics = withCombinedMetrics({ ...metrics, durationMs: Date.now() - startedAtMs });
        run = { ...run, metrics };
        this.setState({
          ...this.state,
          status: "cancelled",
          error: null,
          finishedAt: new Date().toISOString(),
          run,
        });
      },
    });
    return result.toUIMessageStreamResponse();
  }
}
