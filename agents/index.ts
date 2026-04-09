/**
 * Aucctus Market Intelligence System - Agent Entry Point
 *
 * Main API for triggering research. Called by Convex actions and pi-mom.
 */
import { runOrchestrator, type ResearchVerdict } from "./orchestrator";

export { type ResearchVerdict } from "./orchestrator";
export { type IncumbentsResult } from "./incumbents";
export { type FundingResult } from "./funding";
export { type GrowthResult } from "./growth";

export interface ResearchRunResult {
  idea_id: string;
  verdict: ResearchVerdict;
  duration_ms: number;
  success: boolean;
  error?: string;
}

/**
 * Run a complete market research pipeline on a product idea.
 *
 * This is the main entry point. It:
 * 1. Runs the orchestrator (which calls all 3 specialists)
 * 2. Returns the structured verdict
 * 3. All findings are written to the brain during execution
 *
 * @param idea - Description of the product idea to research
 * @param ideaId - Convex ID of the idea record
 * @returns Research results including verdict and timing
 */
export async function runResearch(
  idea: string,
  ideaId: string
): Promise<ResearchRunResult> {
  const startTime = Date.now();

  try {
    const verdict = await runOrchestrator(idea, ideaId);

    return {
      idea_id: ideaId,
      verdict,
      duration_ms: Date.now() - startTime,
      success: true,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error during research";

    return {
      idea_id: ideaId,
      verdict: {
        recommendation: "watch",
        recommendation_changed: false,
        confidence: 0,
        summary: `Research failed: ${message}`,
        opportunity_score: 0,
        opportunity_factors: [],
        risk_score: 0,
        risk_factors: [],
        timing: "uncertain",
        competitive_density: "unknown",
        funding_signal: "unknown",
        growth_signal: "uncertain",
        key_question: "Research pipeline encountered an error - retry recommended.",
        evidence_gaps: [`Pipeline error: ${message}`],
      },
      duration_ms: Date.now() - startTime,
      success: false,
      error: message,
    };
  }
}
