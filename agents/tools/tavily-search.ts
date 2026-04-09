import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { tavily } from "@tavily/core";
import { TAVILY_API_KEY } from "../../shared/config";

const parameters = Type.Object({
  query: Type.String({ description: "The search query" }),
  search_depth: Type.Optional(
    Type.Union([Type.Literal("basic"), Type.Literal("advanced")], {
      description: "basic is fast (default), advanced is more thorough",
    })
  ),
  max_results: Type.Optional(
    Type.Number({ description: "Maximum number of results to return (default 5)" })
  ),
});

type TavilySearchParams = Static<typeof parameters>;

export const tavilySearchTool: AgentTool<typeof parameters> = {
  name: "tavily_search",
  label: "Tavily Search",
  description:
    "Search the web using Tavily. Good for general research, recent news, and broad competitive landscape queries. " +
    "search_depth='advanced' returns more thorough results at higher cost; 'basic' is fast and sufficient for most queries.",
  parameters,
  execute: async (_toolCallId, params: TavilySearchParams, _signal, _onUpdate) => {
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
    const searchDepth = params.search_depth ?? "basic";
    const maxResults = params.max_results ?? 5;

    try {
      const response = await tvly.search(params.query, {
        searchDepth,
        maxResults,
      });

      if (!response.results || response.results.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No results found." }],
          details: { query: params.query, result_count: 0 },
        };
      }

      const formatted = response.results
        .map((result, index) => {
          return [
            `[${index + 1}] ${result.title}`,
            `URL: ${result.url}`,
            `Content: ${result.content}`,
          ].join("\n");
        })
        .join("\n\n---\n\n");

      return {
        content: [
          {
            type: "text" as const,
            text: `Tavily search results for "${params.query}" (${response.results.length} results):\n\n${formatted}`,
          },
        ],
        details: {
          query: params.query,
          result_count: response.results.length,
          search_depth: searchDepth,
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const isRateLimit =
        message.toLowerCase().includes("rate limit") ||
        message.toLowerCase().includes("429");
      return {
        content: [
          {
            type: "text" as const,
            text: isRateLimit
              ? `Tavily rate limit hit. Try again shortly. (${message})`
              : `Tavily search error: ${message}`,
          },
        ],
        details: { error: message, query: params.query },
      };
    }
  },
};
