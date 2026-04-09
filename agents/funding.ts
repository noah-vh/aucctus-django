/**
 * Funding Agent - Venture Capital Analyst
 *
 * Finds funding events in a product space, identifies investors,
 * computes aggregate trends, classifies space maturity.
 * Writes all findings to the brain (Convex) via brain tools.
 */
import { Agent } from "@mariozechner/pi-agent-core";
import { RESEARCH_MODEL } from "./shared/config";
import { FUNDING_SYSTEM_PROMPT } from "./shared/prompts";
import { EmitFn } from "./incumbents";
import { exaSearchTool } from "./tools/exa-search";
import { tavilySearchTool } from "./tools/tavily-search";
import { webFetchTool } from "./tools/web-fetch";
import {
  queryBrain,
  insertFundingTool,
} from "./tools/brain";
import { searchFundingDeepTool } from "./tools/exa-structured";
import { analyzeInvestorTool } from "./tools/investor";
import { upsertInvestorTool, linkCompanyInvestorTool } from "./tools/brain-extended";
import { computeTrendsTool } from "./tools/analysis";

export interface FundingResult {
  events_found: number;
  new_events: number;
  total_funding_usd: number;
  funding_trend: string;
  funding_trend_previous?: string;
  most_active_investors: string[];
  space_maturity: string;
  notable_changes: string[];
  summary: string;
}

/**
 * Run the funding research agent for a given product space.
 * Returns structured findings and writes all events to the brain.
 */
export async function runFundingAgent(
  idea: string,
  ideaId: string,
  emit?: EmitFn,
  signal?: AbortSignal
): Promise<FundingResult> {
  const agent = new Agent({
    initialState: {
      systemPrompt: FUNDING_SYSTEM_PROMPT,
      model: RESEARCH_MODEL,
      thinkingLevel: "low",
      tools: [
        exaSearchTool,
        tavilySearchTool,
        webFetchTool,
        queryBrain,
        insertFundingTool,
        searchFundingDeepTool,
        analyzeInvestorTool,
        upsertInvestorTool,
        linkCompanyInvestorTool,
        computeTrendsTool,
      ],
      messages: [],
    },
  });

  const agentStartTime = Date.now();
  console.log(`[funding] Starting research for "${idea}"`);

  agent.subscribe((event: any) => {
    if (event.type === "tool_execution_start") {
      console.log(`[funding] Tool call: ${event.toolName}`, event.args?.query?.substring(0, 60) || "");
      emit?.({ type: "tool_call", agent: "funding", tool: event.toolName, args: event.args, message: `Calling ${event.toolName}...`, timestamp: Date.now() });
    }
    if (event.type === "tool_execution_end") {
      const summary = event.isError ? `Error` : `Completed ${event.toolName}`;
      console.log(`[funding] Tool done: ${event.toolName} (error: ${event.isError})`);
      emit?.({ type: "tool_result", agent: "funding", tool: event.toolName, message: summary, timestamp: Date.now() });
    }
    if (event.type === "turn_start") {
      console.log(`[funding] LLM turn starting (${Date.now() - agentStartTime}ms elapsed)`);
      emit?.({ type: "status", agent: "funding", message: "Analyzing results...", timestamp: Date.now() });
    }
    if (event.type === "turn_end") {
      console.log(`[funding] LLM turn complete (${Date.now() - agentStartTime}ms elapsed)`);
    }
  });

  const prompt = `Research funding activity in the "${idea}" product space.

Idea ID for brain operations: ${ideaId}

Steps:
1. First, use query_brain with table="funding" and idea_id="${ideaId}" to check known funding events.
2. Search with exa_search for recent funding announcements (limit 5 results).
3. Search with tavily_search for funding news (limit 5 results).
4. For the TOP 2 most notable rounds, use web_fetch to read full details.
5. Use insert_funding for the top 5 most significant funding events only.
6. Compute aggregate signals: total raised, trend direction, investor concentration.

IMPORTANT: Be efficient. Do NOT make more than 12 total tool calls. Focus on the most significant rounds, not every small round.

After completing your research, provide your final response as a JSON object with this exact structure:
{
  "events_found": <total number of events found>,
  "new_events": <number of events not already in the brain>,
  "total_funding_usd": <total dollars raised in the space>,
  "funding_trend": "accelerating" | "stable" | "decelerating" | "insufficient_data",
  "funding_trend_previous": <previous trend if known from brain data, or null>,
  "most_active_investors": ["investor1", "investor2", ...],
  "space_maturity": "early" | "growth" | "mature" | "declining",
  "notable_changes": ["change1", ...],
  "summary": "2-3 paragraph analysis of the funding landscape"
}`;

  console.log(`[funding] Sending prompt to LLM...`);
  await agent.prompt(prompt);

  const duration = Date.now() - agentStartTime;
  console.log(`[funding] Completed in ${duration}ms. Messages: ${agent.state.messages.length}. Error: ${agent.state.errorMessage || "none"}`);

  if (agent.state.errorMessage) {
    console.error("[funding] Agent error:", agent.state.errorMessage);
    return {
      events_found: 0, new_events: 0, total_funding_usd: 0,
      funding_trend: "insufficient_data", most_active_investors: [],
      space_maturity: "early", notable_changes: [],
      summary: `Agent error: ${agent.state.errorMessage}`,
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

  console.log(`[funding] Response content length: ${content.length}`);

  try {
    const jsonMatch = content.match(/\{[\s\S]*?\}(?=[^}]*$)/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as FundingResult;
    }
    const greedyMatch = content.match(/\{[\s\S]*\}/);
    if (greedyMatch) {
      return JSON.parse(greedyMatch[0]) as FundingResult;
    }
    console.log("[funding] No JSON found in response");
  } catch (e) {
    console.error("[funding] JSON parse error:", e);
  }

  return {
    events_found: 0,
    new_events: 0,
    total_funding_usd: 0,
    funding_trend: "insufficient_data",
    most_active_investors: [],
    space_maturity: "early",
    notable_changes: [],
    summary:
      content ||
      (agent.state.errorMessage
        ? `Agent error: ${agent.state.errorMessage}`
        : "Research completed but could not parse structured output."),
  };
}
