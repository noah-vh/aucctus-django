/**
 * Orchestrator / Synthesis Agent - Strategic Advisor
 *
 * Calls the three specialist agents as sub-agent tools,
 * reads structured output, queries brain for historical data,
 * computes delta, and produces final verdict.
 */
import { Agent } from "@mariozechner/pi-agent-core";
import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { RESEARCH_MODEL } from "../shared/config";
import { ORCHESTRATOR_SYSTEM_PROMPT } from "../shared/prompts";
import { queryBrain } from "./tools/brain";
import { assessEvidenceQualityTool, crossIdeaCompareTool } from "./tools/analysis";
import { setMonitoringSchedule, getMonitoringSchedule } from "./tools/scheduling";
import { runIncumbentsAgent, type EmitFn } from "./incumbents";
import { runFundingAgent } from "./funding";
import { runGrowthAgent } from "./growth";

export interface ResearchVerdict {
  recommendation: "pursue" | "watch" | "pass";
  previous_recommendation?: string;
  recommendation_changed: boolean;
  confidence: number;
  summary: string;
  delta_narrative?: string;
  opportunity_score: number;
  opportunity_factors: string[];
  risk_score: number;
  risk_factors: string[];
  timing: string;
  competitive_density: string;
  funding_signal: string;
  growth_signal: string;
  key_question: string;
  evidence_gaps: string[];
}

export interface ResearchResults {
  idea_id: string;
  verdict: ResearchVerdict;
  incumbents_summary: string;
  funding_summary: string;
  growth_summary: string;
}

export { type EmitFn } from "./incumbents";

/**
 * Create sub-agent tools that pass through the emit callback for streaming.
 */
function createSubAgentTools(emit?: EmitFn): AgentTool<any>[] {
  const researchIncumbentsTool: AgentTool = {
    name: "research_incumbents",
    label: "Research Incumbents",
    description:
      "Research companies with products in this space. Finds competitors, extracts features, classifies market position, identifies gaps. Use this first.",
    parameters: Type.Object({
      idea: Type.String({ description: "Product idea or market space to research" }),
      idea_id: Type.String({ description: "ID of the idea in the brain database" }),
    }),
    execute: async (toolCallId, params: any, signal, onUpdate) => {
      emit?.({
        type: "agent_start",
        agent: "incumbents",
        message: "Starting competitive intelligence research...",
        timestamp: Date.now(),
      });

      const result = await runIncumbentsAgent(params.idea, params.idea_id, emit);

      emit?.({
        type: "agent_end",
        agent: "incumbents",
        message: `Found ${result.companies_found} companies (${result.new_entrants} new). Market: ${result.market_classification}`,
        data: result,
        timestamp: Date.now(),
      });

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        details: { agent: "incumbents", companies_found: result.companies_found },
      };
    },
  };

  const researchFundingTool: AgentTool = {
    name: "research_funding",
    label: "Research Funding",
    description:
      "Research funding activity in this product space. Finds funding rounds, investors, amounts, and computes trend signals. Use after incumbents.",
    parameters: Type.Object({
      idea: Type.String({ description: "Product idea or market space to research" }),
      idea_id: Type.String({ description: "ID of the idea in the brain database" }),
    }),
    execute: async (toolCallId, params: any, signal, onUpdate) => {
      emit?.({
        type: "agent_start",
        agent: "funding",
        message: "Starting capital markets analysis...",
        timestamp: Date.now(),
      });

      const result = await runFundingAgent(params.idea, params.idea_id, emit);

      emit?.({
        type: "agent_end",
        agent: "funding",
        message: `Found ${result.events_found} funding events ($${(result.total_funding_usd / 1_000_000).toFixed(0)}M total). Trend: ${result.funding_trend}`,
        data: result,
        timestamp: Date.now(),
      });

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        details: { agent: "funding", events_found: result.events_found },
      };
    },
  };

  const researchGrowthTool: AgentTool = {
    name: "research_growth",
    label: "Research Growth",
    description:
      "Research market size and growth trajectory. Triangulates TAM, CAGR, demand signals. Use after incumbents and funding.",
    parameters: Type.Object({
      idea: Type.String({ description: "Product idea or market space to research" }),
      idea_id: Type.String({ description: "ID of the idea in the brain database" }),
    }),
    execute: async (toolCallId, params: any, signal, onUpdate) => {
      emit?.({
        type: "agent_start",
        agent: "growth",
        message: "Starting market growth analysis...",
        timestamp: Date.now(),
      });

      const result = await runGrowthAgent(params.idea, params.idea_id, emit);

      emit?.({
        type: "agent_end",
        agent: "growth",
        message: `Found ${result.signals_found} signals. Growth: ${result.growth_trend}. Source diversity: ${result.source_diversity}/7`,
        data: result,
        timestamp: Date.now(),
      });

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        details: { agent: "growth", signals_found: result.signals_found },
      };
    },
  };

  return [researchIncumbentsTool, researchFundingTool, researchGrowthTool, queryBrain, assessEvidenceQualityTool, crossIdeaCompareTool, setMonitoringSchedule, getMonitoringSchedule];
}

/**
 * Parse verdict JSON from agent response content.
 */
function parseVerdictFromContent(messages: any[]): ResearchVerdict | null {
  const lastMessage = messages.at(-1);
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

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as ResearchVerdict;
    }
  } catch {
    // Parse error
  }

  return null;
}

/**
 * Default fallback verdict when parsing fails.
 */
function fallbackVerdict(errorMsg?: string): ResearchVerdict {
  return {
    recommendation: "watch",
    recommendation_changed: false,
    confidence: 0,
    summary: errorMsg || "Orchestrator completed but could not produce structured verdict.",
    opportunity_score: 0,
    opportunity_factors: [],
    risk_score: 0,
    risk_factors: [],
    timing: "uncertain",
    competitive_density: "unknown",
    funding_signal: "unknown",
    growth_signal: "uncertain",
    key_question: "Unable to determine - research may have encountered errors.",
    evidence_gaps: ["Full research pipeline may not have completed successfully."],
  };
}

const ORCHESTRATOR_PROMPT = (idea: string, ideaId: string) => `You need to research the product space: "${idea}"

Idea ID: ${ideaId}

Steps:
1. Use query_brain with table="verdicts" and idea_id="${ideaId}" to check for a previous verdict.
2. Call research_incumbents with idea="${idea}" and idea_id="${ideaId}".
3. Call research_funding with the same parameters.
4. Call research_growth with the same parameters.
5. Read all three reports carefully.
6. Optionally use assess_evidence_quality with idea_id="${ideaId}" to score research quality.
7. If there was a previous verdict, compare and note what changed.
8. After forming your verdict, adjust monitoring frequency based on what the signals show:
   - If funding activity is spiking, new entrants are appearing, or the space is accelerating, use set_monitoring_schedule to increase funding_pulse and news_monitor to "daily".
   - If the space is stable with no meaningful change since the last run, use set_monitoring_schedule to reduce scan frequency to "weekly" or "monthly" to save resources.
   - You can call get_monitoring_schedule first to see if overrides already exist before changing anything.
9. Produce your final verdict.

IMPORTANT: Complete all steps efficiently. Do not make unnecessary extra tool calls. After receiving the three specialist reports, synthesize immediately.

Return your final verdict as a JSON object with this exact structure:
{
  "recommendation": "pursue" | "watch" | "pass",
  "previous_recommendation": <previous recommendation or null>,
  "recommendation_changed": true/false,
  "confidence": <0-100>,
  "summary": "2-3 paragraph executive summary",
  "delta_narrative": "what changed since last run" or null,
  "opportunity_score": <0-100>,
  "opportunity_factors": ["factor1", "factor2", ...],
  "risk_score": <0-100>,
  "risk_factors": ["risk1", "risk2", ...],
  "timing": "too_early" | "early" | "right_time" | "late",
  "competitive_density": "open" | "moderate" | "crowded" | "dominated",
  "funding_signal": "hot" | "warming" | "stable" | "cooling",
  "growth_signal": "accelerating" | "steady" | "decelerating" | "uncertain",
  "key_question": "The single most important question to answer next",
  "evidence_gaps": ["gap1", "gap2", ...]
}`;

/**
 * Run the orchestrator without streaming (for Convex actions, pi-mom).
 */
export async function runOrchestrator(
  idea: string,
  ideaId: string,
  signal?: AbortSignal
): Promise<ResearchVerdict> {
  return runOrchestratorStreaming(idea, ideaId);
}

/**
 * Run the orchestrator with optional streaming via emit callback.
 * This is the primary implementation used by both the SSE route and the non-streaming path.
 */
export async function runOrchestratorStreaming(
  idea: string,
  ideaId: string,
  emit?: EmitFn
): Promise<ResearchVerdict> {
  const tools = createSubAgentTools(emit);

  const agent = new Agent({
    initialState: {
      systemPrompt: ORCHESTRATOR_SYSTEM_PROMPT,
      model: RESEARCH_MODEL,
      thinkingLevel: "low",
      tools,
      messages: [],
    },
  });

  const orchStartTime = Date.now();
  console.log(`[orchestrator] Starting research for "${idea}"`);

  // Subscribe to orchestrator-level events
  agent.subscribe((event: any) => {
    if (event.type === "tool_execution_start") {
      console.log(`[orchestrator] Tool call: ${event.toolName}`);
      emit?.({
        type: "status",
        agent: "orchestrator",
        message: `Calling ${event.toolName}...`,
        tool: event.toolName,
        timestamp: Date.now(),
      });
    }
    if (event.type === "tool_execution_end") {
      console.log(`[orchestrator] Tool done: ${event.toolName} (${Date.now() - orchStartTime}ms elapsed)`);
    }
    if (event.type === "turn_start") {
      console.log(`[orchestrator] LLM turn starting (${Date.now() - orchStartTime}ms elapsed)`);
      emit?.({ type: "status", agent: "orchestrator", message: "Synthesizing verdict...", timestamp: Date.now() });
    }
    if (event.type === "turn_end") {
      console.log(`[orchestrator] LLM turn complete (${Date.now() - orchStartTime}ms elapsed)`);
    }
  });

  emit?.({
    type: "status",
    agent: "orchestrator",
    message: `Researching "${idea}"...`,
    timestamp: Date.now(),
  });

  const prompt = ORCHESTRATOR_PROMPT(idea, ideaId);

  try {
    console.log(`[orchestrator] Sending prompt to LLM...`);
    await agent.prompt(prompt);
  } catch (promptError) {
    const errMsg = promptError instanceof Error ? promptError.message : String(promptError);
    console.error("[orchestrator] agent.prompt() threw:", errMsg);
    emit?.({
      type: "error",
      agent: "orchestrator",
      message: `Agent error: ${errMsg}`,
      timestamp: Date.now(),
    });
    return fallbackVerdict(`Orchestrator error: ${errMsg}`);
  }

  const orchDuration = Date.now() - orchStartTime;
  console.log(`[orchestrator] Prompt completed in ${orchDuration}ms. Messages: ${agent.state.messages.length}. Error: ${agent.state.errorMessage || "none"}`);

  // Check for error state (some models report errors without throwing)
  if (agent.state.errorMessage) {
    console.error("[orchestrator] Agent error state:", agent.state.errorMessage);
    emit?.({
      type: "error",
      agent: "orchestrator",
      message: agent.state.errorMessage,
      timestamp: Date.now(),
    });
    return fallbackVerdict(`Agent error: ${agent.state.errorMessage}`);
  }

  const verdict = parseVerdictFromContent(agent.state.messages);

  if (verdict) {
    emit?.({
      type: "status",
      agent: "orchestrator",
      message: `Verdict: ${verdict.recommendation.toUpperCase()} (${verdict.confidence}% confidence)`,
      timestamp: Date.now(),
    });
    return verdict;
  }

  console.log("[orchestrator] Could not parse verdict from response");
  return fallbackVerdict();
}
