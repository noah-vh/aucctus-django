import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { tavily } from "@tavily/core";
import { TAVILY_API_KEY } from "../shared/config";

// ---------------------------------------------------------------------------
// analyzeInvestor
// ---------------------------------------------------------------------------

const AnalyzeInvestorSchema = Type.Object({
  investor_name: Type.String({ description: "Full name of the investor or firm to analyze" }),
  space: Type.Optional(
    Type.String({ description: "Optional market space to narrow the search, e.g. 'fintech', 'developer tools'" })
  ),
});

type AnalyzeInvestorParams = Static<typeof AnalyzeInvestorSchema>;

export const analyzeInvestorTool: AgentTool<typeof AnalyzeInvestorSchema> = {
  name: "analyzeInvestor",
  label: "Analyze Investor",
  description:
    "Research an investor or VC firm using Tavily. Searches for their portfolio, investment thesis, " +
    "check size, and notable investments. If a market space is provided, also searches for their " +
    "activity in that specific space.",
  parameters: AnalyzeInvestorSchema,
  execute: async (_toolCallId, params: AnalyzeInvestorParams) => {
    const apiKey = TAVILY_API_KEY;
    if (!apiKey) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Error: TAVILY_API_KEY is not configured in the environment.",
          },
        ],
        details: { error: "missing_api_key" },
      };
    }

    const tvly = tavily({ apiKey });
    const { investor_name, space } = params;

    const queries = [
      `${investor_name} portfolio investments`,
      `${investor_name} investment thesis`,
    ];

    if (space) {
      queries.push(`${investor_name} ${space} investment`);
    }

    const allResults: Array<{ title: string; url: string; content: string; query: string }> = [];

    for (const query of queries) {
      console.info("[analyzeInvestor] tavily search", { query });
      try {
        const response = await tvly.search(query, {
          searchDepth: "basic",
          maxResults: 5,
        });

        if (response.results && response.results.length > 0) {
          for (const r of response.results) {
            allResults.push({
              title: r.title,
              url: r.url,
              content: r.content,
              query,
            });
          }
        }
        console.info("[analyzeInvestor] tavily search ok", { query, count: response.results?.length ?? 0 });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[analyzeInvestor] tavily search failed", { query, error: message });
        // Continue with remaining queries rather than aborting entirely
      }
    }

    if (allResults.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No results found for investor "${investor_name}".`,
          },
        ],
        details: { investor_name, result_count: 0 },
      };
    }

    // Deduplicate by URL
    const seen = new Set<string>();
    const deduped = allResults.filter((r) => {
      if (seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
    });

    const sections = deduped
      .map((r, i) =>
        [
          `[${i + 1}] ${r.title}`,
          `URL: ${r.url}`,
          `Content: ${r.content}`,
        ].join("\n")
      )
      .join("\n\n---\n\n");

    const header = [
      `Investor Profile: ${investor_name}`,
      space ? `Space filter: ${space}` : null,
      `Sources found: ${deduped.length}`,
      "",
    ]
      .filter(Boolean)
      .join("\n");

    const text = `${header}\n${sections}`;

    return {
      content: [{ type: "text" as const, text }],
      details: {
        investor_name,
        space: space ?? null,
        result_count: deduped.length,
        source_urls: deduped.map((r) => r.url),
      },
    };
  },
};
