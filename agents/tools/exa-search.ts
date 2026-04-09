import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import Exa from "exa-js";
import { EXA_API_KEY } from "../shared/config";

// Map user-facing category names to Exa API category values.
// Exa uses spaces in category strings ("research paper", not "research_paper").
const CATEGORY_MAP = {
  company: "company",
  news: "news",
  research_paper: "research paper",
} as const;

const parameters = Type.Object({
  query: Type.String({ description: "The search query" }),
  category: Type.Optional(
    Type.Union(
      [
        Type.Literal("company"),
        Type.Literal("news"),
        Type.Literal("research_paper"),
      ],
      { description: "Content category filter: company, news, or research_paper" }
    )
  ),
  search_type: Type.Optional(
    Type.Union([Type.Literal("auto"), Type.Literal("deep")], {
      description: "auto is fast (default), deep is more thorough",
    })
  ),
  num_results: Type.Optional(
    Type.Number({ description: "Number of results to return (default 10)" })
  ),
});

type ExaSearchParams = Static<typeof parameters>;

export const exaSearchTool: AgentTool<typeof parameters> = {
  name: "exa_search",
  label: "Exa Search",
  description:
    "Search the web using Exa's neural search. Use category='company' to find companies, " +
    "category='news' for recent news, category='research_paper' for academic content. " +
    "search_type='deep' is more thorough but slower; 'auto' is fast and suitable for most queries.",
  parameters,
  execute: async (_toolCallId, params: ExaSearchParams, _signal, _onUpdate) => {
    const apiKey = EXA_API_KEY;
    if (!apiKey) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Error: EXA_API_KEY is not configured in the environment.",
          },
        ],
        details: { error: "missing_api_key" },
      };
    }

    const exa = new Exa(apiKey);
    const numResults = params.num_results ?? 10;
    const searchType = params.search_type ?? "auto";
    const category = params.category
      ? CATEGORY_MAP[params.category]
      : undefined;

    try {
      // "deep" maps to "deep-lite" in the Exa type system (DeepSearchOptions).
      // "auto" and other non-deep types use NonDeepSearchOptions.
      let response;
      if (searchType === "deep") {
        response = await exa.search(params.query, {
          type: "deep-lite",
          numResults,
          ...(category ? { category } : {}),
          contents: {
            highlights: { maxCharacters: 4000 },
          },
        });
      } else {
        response = await exa.search(params.query, {
          type: "auto",
          numResults,
          ...(category ? { category } : {}),
          contents: {
            highlights: { maxCharacters: 4000 },
          },
        });
      }

      if (!response.results || response.results.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No results found." }],
          details: { query: params.query, result_count: 0 },
        };
      }

      const formatted = response.results
        .map((result, index) => {
          const title = result.title ?? "(no title)";
          const url = result.url;
          const published = result.publishedDate ?? "unknown date";
          // highlights is only present when ContentsOptions includes highlights.
          // Cast to any since the generic conditional type doesn't narrow here.
          const highlights =
            "highlights" in result && Array.isArray((result as any).highlights)
              ? (result as any).highlights.join("\n")
              : "(no highlights)";

          return [
            `[${index + 1}] ${title}`,
            `URL: ${url}`,
            `Published: ${published}`,
            `Highlights:\n${highlights}`,
          ].join("\n");
        })
        .join("\n\n---\n\n");

      return {
        content: [
          {
            type: "text" as const,
            text: `Exa search results for "${params.query}" (${response.results.length} results):\n\n${formatted}`,
          },
        ],
        details: {
          query: params.query,
          result_count: response.results.length,
          search_type: searchType,
          category: params.category ?? null,
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
              ? `Exa rate limit hit. Try again shortly. (${message})`
              : `Exa search error: ${message}`,
          },
        ],
        details: { error: message, query: params.query },
      };
    }
  },
};
