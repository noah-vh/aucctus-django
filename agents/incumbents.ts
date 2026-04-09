/**
 * Incumbents Agent - Competitive Intelligence Analyst
 *
 * Finds companies with products in a given space, extracts features,
 * classifies market position, identifies gaps and whitespace.
 * Writes all findings to the brain (Convex) via brain tools.
 */
import { Agent } from "@mariozechner/pi-agent-core";
import { RESEARCH_MODEL } from "./shared/config";
import { INCUMBENTS_SYSTEM_PROMPT } from "./shared/prompts";
import { exaSearchTool } from "./tools/exa-search";
import { tavilySearchTool } from "./tools/tavily-search";
import { webFetchTool } from "./tools/web-fetch";
import {
  queryBrain,
  upsertCompanyTool,
} from "./tools/brain";
import { searchCompaniesDeepTool } from "./tools/exa-structured";
import { searchHiringTool } from "./tools/hiring";
import { insertCompanyMetricTool } from "./tools/brain-extended";
import { compareFeaturesTool } from "./tools/analysis";

export type EmitFn = (event: {
  type: string;
  agent: string;
  message?: string;
  tool?: string;
  args?: any;
  data?: any;
  timestamp: number;
}) => void;

export interface IncumbentsResult {
  companies_found: number;
  new_entrants: number;
  companies_updated: number;
  market_classification: string;
  feature_gaps: string[];
  whitespace_opportunities: string[];
  notable_changes: string[];
  summary: string;
}

/**
 * Run the incumbents research agent for a given product space.
 * Returns structured findings and writes all companies to the brain.
 */
export async function runIncumbentsAgent(
  idea: string,
  ideaId: string,
  emit?: EmitFn,
  signal?: AbortSignal
): Promise<IncumbentsResult> {
  const agent = new Agent({
    initialState: {
      systemPrompt: INCUMBENTS_SYSTEM_PROMPT,
      model: RESEARCH_MODEL,
      thinkingLevel: "low",
      tools: [
        exaSearchTool,
        tavilySearchTool,
        webFetchTool,
        queryBrain,
        upsertCompanyTool,
        searchCompaniesDeepTool,
        searchHiringTool,
        insertCompanyMetricTool,
        compareFeaturesTool,
      ],
      messages: [],
    },
  });

  const agentStartTime = Date.now();
  console.log(`[incumbents] Starting research for "${idea}"`);

  agent.subscribe((event: any) => {
    if (event.type === "tool_execution_start") {
      console.log(`[incumbents] Tool call: ${event.toolName}`, event.args?.query?.substring(0, 60) || "");
      emit?.({
        type: "tool_call",
        agent: "incumbents",
        tool: event.toolName,
        args: event.args,
        message: `Calling ${event.toolName}...`,
        timestamp: Date.now(),
      });
    }
    if (event.type === "tool_execution_end") {
      const summary = event.isError
        ? `Error: ${event.result?.content?.[0]?.text?.substring(0, 100)}`
        : `Completed ${event.toolName}`;
      console.log(`[incumbents] Tool done: ${event.toolName} (error: ${event.isError})`);
      emit?.({
        type: "tool_result",
        agent: "incumbents",
        tool: event.toolName,
        message: summary,
        timestamp: Date.now(),
      });
    }
    if (event.type === "turn_start") {
      console.log(`[incumbents] LLM turn starting (${Date.now() - agentStartTime}ms elapsed)`);
      emit?.({ type: "status", agent: "incumbents", message: "Analyzing results...", timestamp: Date.now() });
    }
    if (event.type === "turn_end") {
      console.log(`[incumbents] LLM turn complete (${Date.now() - agentStartTime}ms elapsed)`);
    }
  });

  const prompt = `Research the incumbents in the "${idea}" product space.

Idea ID for brain operations: ${ideaId}

Steps:
1. First, use query_brain with table="companies" and idea_id="${ideaId}" to check what companies we already know about.
2. Search with exa_search using category="company" for direct competitors (limit to 5 results).
3. Search with tavily_search for broader landscape (limit to 5 results).
4. For the TOP 3 most important companies only, use web_fetch to read their product pages.
5. Use upsert_company to save ONLY the top 5 most important companies to the brain. Do not save more than 5.
6. Identify feature gaps and whitespace opportunities.

IMPORTANT: Be efficient. Do NOT make more than 15 total tool calls. Focus on quality over quantity - find the 5 most important players, not every player.

After completing your research, provide your final response as a JSON object with this exact structure:
{
  "companies_found": <number>,
  "new_entrants": <number of companies not previously in the brain>,
  "companies_updated": <number of existing companies with updated info>,
  "market_classification": "open" | "moderate" | "crowded" | "dominated",
  "feature_gaps": ["gap1", "gap2", ...],
  "whitespace_opportunities": ["opportunity1", ...],
  "notable_changes": ["change1", ...],
  "summary": "2-3 paragraph summary of the competitive landscape"
}`;

  console.log(`[incumbents] Sending prompt to LLM...`);
  await agent.prompt(prompt);

  const duration = Date.now() - agentStartTime;
  console.log(`[incumbents] Completed in ${duration}ms. Messages: ${agent.state.messages.length}. Error: ${agent.state.errorMessage || "none"}`);

  if (agent.state.errorMessage) {
    console.error("[incumbents] Agent error:", agent.state.errorMessage);
    return {
      companies_found: 0, new_entrants: 0, companies_updated: 0,
      market_classification: "unknown",
      feature_gaps: [], whitespace_opportunities: [], notable_changes: [],
      summary: `Agent error: ${agent.state.errorMessage}`,
    };
  }

  // Extract the final response
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

  console.log(`[incumbents] Response content length: ${content.length}`);

  // Parse JSON from response - use non-greedy match to avoid grabbing too much
  try {
    const jsonMatch = content.match(/\{[\s\S]*?\}(?=[^}]*$)/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as IncumbentsResult;
    }
    // Try greedy as fallback
    const greedyMatch = content.match(/\{[\s\S]*\}/);
    if (greedyMatch) {
      return JSON.parse(greedyMatch[0]) as IncumbentsResult;
    }
    console.log("[incumbents] No JSON found in response");
  } catch (e) {
    console.error("[incumbents] JSON parse error:", e);
  }

  return {
    companies_found: 0,
    new_entrants: 0,
    companies_updated: 0,
    market_classification: "unknown" as string,
    feature_gaps: [],
    whitespace_opportunities: [],
    notable_changes: [],
    summary:
      content ||
      (agent.state.errorMessage
        ? `Agent error: ${agent.state.errorMessage}`
        : "Research completed but could not parse structured output."),
  };
}
