import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { tavily } from "@tavily/core";
import { TAVILY_API_KEY } from "../shared/config";

const parameters = Type.Object({
  space: Type.String({
    description:
      "The product space or topic to search for community discussion (e.g. 'observability tooling', 'AI code review')",
  }),
  platforms: Type.Optional(
    Type.Array(Type.String(), {
      description:
        "Platforms to search. Supported: 'reddit', 'hackernews', 'producthunt'. Defaults to all three.",
    })
  ),
});

type SearchCommunityParams = Static<typeof parameters>;

const DEFAULT_PLATFORMS = ["reddit", "hackernews", "producthunt"];

// Platform-specific query builders and display labels.
const PLATFORM_CONFIG: Record<
  string,
  { label: string; buildQuery: (space: string) => string }
> = {
  reddit: {
    label: "Reddit",
    buildQuery: (space) => `${space} site:reddit.com`,
  },
  hackernews: {
    label: "Hacker News",
    buildQuery: (space) => `${space} site:news.ycombinator.com`,
  },
  producthunt: {
    label: "Product Hunt",
    buildQuery: (space) => `${space} producthunt`,
  },
};

// Very lightweight sentiment direction from snippet text.
// Returns "positive", "negative", or "mixed" - intentionally rough.
function roughSentiment(texts: string[]): string {
  const combined = texts.join(" ").toLowerCase();

  const positiveWords = [
    "love",
    "great",
    "awesome",
    "excellent",
    "recommend",
    "best",
    "fantastic",
    "helpful",
    "easy",
    "fast",
    "powerful",
    "impressive",
    "solid",
    "good",
    "amazing",
  ];
  const negativeWords = [
    "hate",
    "terrible",
    "awful",
    "bad",
    "broken",
    "slow",
    "buggy",
    "expensive",
    "disappointing",
    "avoid",
    "worse",
    "poor",
    "lacking",
    "frustrating",
    "issue",
    "problem",
  ];

  let pos = 0;
  let neg = 0;
  for (const w of positiveWords) {
    if (combined.includes(w)) pos++;
  }
  for (const w of negativeWords) {
    if (combined.includes(w)) neg++;
  }

  if (pos === 0 && neg === 0) return "neutral";
  if (pos > neg * 1.5) return "positive";
  if (neg > pos * 1.5) return "negative";
  return "mixed";
}

export const searchCommunityTool: AgentTool<typeof parameters> = {
  name: "search_community",
  label: "Search Community Discussions",
  description:
    "Searches community platforms (Reddit, Hacker News, Product Hunt) for discussions about a product space. " +
    "Returns a per-platform summary with mention count, sample content, and a rough sentiment direction.",
  parameters,
  execute: async (
    _toolCallId,
    params: SearchCommunityParams,
    _signal,
    _onUpdate
  ) => {
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
    const space = params.space;

    // Validate requested platforms and fall back to defaults.
    const requestedPlatforms = (params.platforms ?? DEFAULT_PLATFORMS).filter(
      (p) => PLATFORM_CONFIG[p] !== undefined
    );

    if (requestedPlatforms.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text:
              "No valid platforms specified. Supported platforms: reddit, hackernews, producthunt.",
          },
        ],
        details: { error: "no_valid_platforms", space },
      };
    }

    try {
      // Run all platform queries in parallel.
      const platformResults = await Promise.all(
        requestedPlatforms.map(async (platform) => {
          const config = PLATFORM_CONFIG[platform];
          const query = config.buildQuery(space);
          try {
            const response = await tvly.search(query, {
              searchDepth: "basic",
              maxResults: 5,
            });
            return {
              platform,
              label: config.label,
              query,
              results: response.results ?? [],
              error: null,
            };
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return { platform, label: config.label, query, results: [], error: message };
          }
        })
      );

      const totalMentions = platformResults.reduce(
        (sum, p) => sum + p.results.length,
        0
      );

      if (totalMentions === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No community discussions found for "${space}" across: ${requestedPlatforms.join(", ")}.`,
            },
          ],
          details: { space, platforms: requestedPlatforms, total_mentions: 0 },
        };
      }

      const sections = platformResults.map((p) => {
        if (p.error) {
          return `## ${p.label}\nError fetching results: ${p.error}`;
        }

        if (p.results.length === 0) {
          return `## ${p.label}\nNo results found.`;
        }

        const snippets = p.results.map((r) => r.content ?? "").filter(Boolean);
        const sentiment = roughSentiment(snippets);

        const samples = p.results
          .slice(0, 3)
          .map(
            (r, i) =>
              `  [${i + 1}] ${r.title ?? "(no title)"}\n       ${r.url}\n       ${(r.content ?? "").slice(0, 200)}...`
          )
          .join("\n");

        return [
          `## ${p.label}`,
          `Mentions: ${p.results.length} | Sentiment direction: ${sentiment}`,
          `Sample results:`,
          samples,
        ].join("\n");
      });

      const output = [
        `Community discussion summary for "${space}":`,
        `Platforms searched: ${requestedPlatforms.map((p) => PLATFORM_CONFIG[p].label).join(", ")}`,
        `Total mentions: ${totalMentions}`,
        "",
        ...sections,
      ].join("\n");

      return {
        content: [{ type: "text" as const, text: output }],
        details: {
          space,
          platforms: requestedPlatforms,
          total_mentions: totalMentions,
          per_platform: Object.fromEntries(
            platformResults.map((p) => [p.platform, p.results.length])
          ),
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
              : `Community search error: ${message}`,
          },
        ],
        details: { error: message, space },
      };
    }
  },
};
