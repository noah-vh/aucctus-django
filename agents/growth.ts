/**
 * Growth Agent - Market Analyst
 *
 * Estimates market size and growth trajectory by triangulating
 * multiple signal types: TAM reports, hiring trends, search interest,
 * analyst estimates, organic demand signals.
 * Writes all findings to the brain (Convex) via brain tools.
 */
import { Agent } from "@mariozechner/pi-agent-core";
import { RESEARCH_MODEL } from "./shared/config";
import { GROWTH_SYSTEM_PROMPT } from "./shared/prompts";
import { EmitFn } from "./incumbents";
import { exaSearchTool } from "./tools/exa-search";
import { tavilySearchTool } from "./tools/tavily-search";
import { webFetchTool } from "./tools/web-fetch";
import {
  queryBrain,
  insertSignalTool,
} from "./tools/brain";
import { searchHiringTool } from "./tools/hiring";
import { searchCommunityTool } from "./tools/community";
import { computeTrendsTool } from "./tools/analysis";

export interface GrowthResult {
  signals_found: number;
  new_signals: number;
  tam_low_usd?: number;
  tam_high_usd?: number;
  cagr_estimate_pct?: number;
  cagr_range?: number[];
  growth_trend: string;
  growth_trend_previous?: string;
  source_diversity: number;
  notable_changes: string[];
  methodology_notes: string;
  summary: string;
}

/**
 * Run the growth research agent for a given product space.
 * Returns structured findings and writes all signals to the brain.
 */
export async function runGrowthAgent(
  idea: string,
  ideaId: string,
  emit?: EmitFn,
  signal?: AbortSignal
): Promise<GrowthResult> {
  const agent = new Agent({
    initialState: {
      systemPrompt: GROWTH_SYSTEM_PROMPT,
      model: RESEARCH_MODEL,
      thinkingLevel: "low",
      tools: [
        exaSearchTool,
        tavilySearchTool,
        webFetchTool,
        queryBrain,
        insertSignalTool,
        searchHiringTool,
        searchCommunityTool,
        computeTrendsTool,
      ],
      messages: [],
    },
  });

  const agentStartTime = Date.now();
  console.log(`[growth] Starting research for "${idea}"`);

  agent.subscribe((event: any) => {
    if (event.type === "tool_execution_start") {
      console.log(`[growth] Tool call: ${event.toolName}`, event.args?.query?.substring(0, 60) || "");
      emit?.({ type: "tool_call", agent: "growth", tool: event.toolName, args: event.args, message: `Calling ${event.toolName}...`, timestamp: Date.now() });
    }
    if (event.type === "tool_execution_end") {
      const summary = event.isError ? `Error` : `Completed ${event.toolName}`;
      console.log(`[growth] Tool done: ${event.toolName} (error: ${event.isError})`);
      emit?.({ type: "tool_result", agent: "growth", tool: event.toolName, message: summary, timestamp: Date.now() });
    }
    if (event.type === "turn_start") {
      console.log(`[growth] LLM turn starting (${Date.now() - agentStartTime}ms elapsed)`);
      emit?.({ type: "status", agent: "growth", message: "Analyzing results...", timestamp: Date.now() });
    }
    if (event.type === "turn_end") {
      console.log(`[growth] LLM turn complete (${Date.now() - agentStartTime}ms elapsed)`);
    }
  });

  const prompt = `Research the market size and growth trajectory of the "${idea}" product space.

Idea ID for brain operations: ${ideaId}

Steps:
1. First, use query_brain with table="signals" and idea_id="${ideaId}" to check what market signals we already have.
2. Search with tavily_search for TAM and growth rate data (1 search, limit 5 results).
3. Search with exa_search for structured market data (1 search, limit 5 results).
4. For the TOP 2 most useful sources, use web_fetch to read full content.
5. Use insert_signal for the 3-5 most important signals only.
6. Triangulate across sources - note convergence and contradictions.

IMPORTANT: Be efficient. Do NOT make more than 10 total tool calls. Quality over quantity.

IMPORTANT: Always give TAM as a range (tam_low_usd and tam_high_usd), never a single number.
Report source_diversity as the count of unique signal_types you found (out of 7 possible).

After completing your research, provide your final response as a JSON object with this exact structure:
{
  "signals_found": <total signals found>,
  "new_signals": <signals not already in brain>,
  "tam_low_usd": <lower bound TAM estimate or null>,
  "tam_high_usd": <upper bound TAM estimate or null>,
  "cagr_estimate_pct": <estimated CAGR percentage or null>,
  "cagr_range": [<low>, <high>] or null,
  "growth_trend": "accelerating" | "steady" | "decelerating" | "emerging" | "declining" | "uncertain",
  "growth_trend_previous": <previous trend from brain or null>,
  "source_diversity": <number of unique signal types found, 0-7>,
  "notable_changes": ["change1", ...],
  "methodology_notes": "Explain how you triangulated and which sources agreed/disagreed",
  "summary": "2-3 paragraph analysis of the market growth trajectory"
}`;

  console.log(`[growth] Sending prompt to LLM...`);
  await agent.prompt(prompt);

  const duration = Date.now() - agentStartTime;
  console.log(`[growth] Completed in ${duration}ms. Messages: ${agent.state.messages.length}. Error: ${agent.state.errorMessage || "none"}`);

  if (agent.state.errorMessage) {
    console.error("[growth] Agent error:", agent.state.errorMessage);
    return {
      signals_found: 0, new_signals: 0, growth_trend: "uncertain",
      source_diversity: 0, notable_changes: [],
      methodology_notes: "Agent error", summary: `Agent error: ${agent.state.errorMessage}`,
    };
  }

  const lastMessage = agent.state.messages.at(-1);
  const content =
    lastMessage?.role === "assistant"
      ? typeof lastMessage.content === "string"
        ? lastMessage.content
        : Array.isArray(lastMessage.content)
          ? lastMessage.content
              .filter((b: { type: string }) => b.type === "text")
              .map((b: { type: string; text?: string }) => b.text || "")
              .join("")
          : ""
      : "";

  console.log(`[growth] Response content length: ${content.length}`);

  try {
    const jsonMatch = content.match(/\{[\s\S]*?\}(?=[^}]*$)/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as GrowthResult;
    }
    const greedyMatch = content.match(/\{[\s\S]*\}/);
    if (greedyMatch) {
      return JSON.parse(greedyMatch[0]) as GrowthResult;
    }
    console.log("[growth] No JSON found in response");
  } catch (e) {
    console.error("[growth] JSON parse error:", e);
  }

  return {
    signals_found: 0,
    new_signals: 0,
    growth_trend: "uncertain",
    source_diversity: 0,
    notable_changes: [],
    methodology_notes: "Could not parse structured output.",
    summary:
      content ||
      (agent.state.errorMessage
        ? `Agent error: ${agent.state.errorMessage}`
        : "Research completed but could not parse structured output."),
  };
}
