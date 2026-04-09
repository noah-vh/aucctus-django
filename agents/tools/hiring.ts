import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { tavily } from "@tavily/core";
import { TAVILY_API_KEY } from "../../shared/config";

const parameters = Type.Object({
  space: Type.String({
    description:
      "The product space or market category to search for hiring activity (e.g. 'observability tooling', 'AI code review')",
  }),
  num_results: Type.Optional(
    Type.Number({
      description: "Number of search results per query (default 10)",
    })
  ),
});

type SearchHiringParams = Static<typeof parameters>;

// Extract a rough company name from a result URL or title.
// Returns null when nothing useful can be parsed.
function extractCompanyFromUrl(url: string): string | null {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    // Strip common job board domains - we don't want "linkedin.com" as a company.
    const JOB_BOARDS = [
      "linkedin.com",
      "indeed.com",
      "glassdoor.com",
      "greenhouse.io",
      "lever.co",
      "workday.com",
      "jobs.ashbyhq.com",
      "boards.greenhouse.io",
      "careers.google.com",
      "jobs.lever.co",
      "apply.workable.com",
    ];
    if (JOB_BOARDS.some((b) => hostname.includes(b))) return null;
    // Use the second-level domain as a rough company name.
    const parts = hostname.split(".");
    return parts.length >= 2 ? parts[parts.length - 2] : null;
  } catch {
    return null;
  }
}

// Pull a company hint from a job board URL path or title when the hostname is a board.
function extractCompanyFromPath(url: string, title: string): string | null {
  // greenhouse.io paths look like: boards.greenhouse.io/companyslug/jobs/...
  const ghMatch = url.match(/greenhouse\.io\/([^/?#]+)/);
  if (ghMatch) return ghMatch[1];

  // lever.co paths look like: jobs.lever.co/companyslug/...
  const leverMatch = url.match(/lever\.co\/([^/?#]+)/);
  if (leverMatch) return leverMatch[1];

  // Ashby paths look like: jobs.ashbyhq.com/companyslug/...
  const ashbyMatch = url.match(/ashbyhq\.com\/([^/?#]+)/);
  if (ashbyMatch) return ashbyMatch[1];

  // Fall back to the title (trim common suffixes like "Jobs | Company" or "Careers at Company")
  const titleMatch = title.match(/(?:careers?\s+at|jobs\s+at)\s+(.+)/i);
  if (titleMatch) return titleMatch[1].trim();

  return null;
}

export const searchHiringTool: AgentTool<typeof parameters> = {
  name: "search_hiring",
  label: "Search Hiring Activity",
  description:
    "Searches for hiring and job posting activity in a product space. Runs two Tavily queries " +
    "('[space] hiring jobs engineering' and '[space] careers open positions') and returns a " +
    "summary of which companies are actively hiring and what kinds of roles they are posting.",
  parameters,
  execute: async (
    _toolCallId,
    params: SearchHiringParams,
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
    const maxResults = params.num_results ?? 10;
    const space = params.space;

    const queries = [
      `${space} hiring jobs engineering`,
      `${space} careers open positions`,
    ];

    try {
      const responses = await Promise.all(
        queries.map((q) => tvly.search(q, { searchDepth: "basic", maxResults }))
      );

      // Collect all results across both queries.
      const allResults = responses.flatMap((r) => r.results ?? []);

      if (allResults.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No hiring results found for space: "${space}".`,
            },
          ],
          details: { space, result_count: 0 },
        };
      }

      // Group results by resolved company name.
      const companyMap = new Map<
        string,
        { count: number; titles: string[]; urls: string[] }
      >();

      for (const result of allResults) {
        const company =
          extractCompanyFromUrl(result.url) ||
          extractCompanyFromPath(result.url, result.title ?? "") ||
          "unknown";

        const key = company.toLowerCase();
        if (!companyMap.has(key)) {
          companyMap.set(key, { count: 0, titles: [], urls: [] });
        }
        const entry = companyMap.get(key)!;
        entry.count += 1;
        if (result.title) entry.titles.push(result.title);
        entry.urls.push(result.url);
      }

      // Sort by result count descending.
      const sorted = [...companyMap.entries()]
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 20);

      const lines = sorted.map(([company, data]) => {
        const sampleTitle = data.titles[0] ?? "(no title)";
        const sampleUrl = data.urls[0] ?? "";
        return `- ${company} (${data.count} result${data.count !== 1 ? "s" : ""}): ${sampleTitle}\n  ${sampleUrl}`;
      });

      const summary = [
        `Hiring activity in "${space}" - ${sorted.length} companies detected across ${allResults.length} results:`,
        "",
        ...lines,
      ].join("\n");

      return {
        content: [{ type: "text" as const, text: summary }],
        details: {
          space,
          queries,
          total_results: allResults.length,
          companies_found: sorted.length,
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
              : `Hiring search error: ${message}`,
          },
        ],
        details: { error: message, space },
      };
    }
  },
};
