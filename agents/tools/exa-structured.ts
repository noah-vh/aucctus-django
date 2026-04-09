import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import Exa from "exa-js";
import { EXA_API_KEY } from "../../shared/config";

// ---- searchCompaniesDeep ------------------------------------------------

const searchCompaniesDeepParams = Type.Object({
  query: Type.String({ description: "The search query for companies" }),
  num_results: Type.Optional(
    Type.Number({ description: "Number of results to return (default 5)" })
  ),
});

type SearchCompaniesDeepParams = Static<typeof searchCompaniesDeepParams>;

// Max 10 total properties across the schema tree (Exa limit).
// The items object has 8 properties + the top-level "companies" = 9 total.
const COMPANIES_OUTPUT_SCHEMA = {
  type: "object" as const,
  required: ["companies"],
  properties: {
    companies: {
      type: "array",
      items: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          founded_year: { type: "number" },
          employee_count: { type: "number" },
          funding_total: { type: "string" },
          key_products: { type: "string" },
          pricing_model: { type: "string" },
          headquarters: { type: "string" },
        },
      },
    },
  },
};

export const searchCompaniesDeepTool: AgentTool<typeof searchCompaniesDeepParams> = {
  name: "search_companies_deep",
  label: "Search Companies (Deep Structured)",
  description:
    "Deep structured search for companies. Uses Exa's deep search with a JSON output schema " +
    "to extract company profiles including description, founding year, employee count, " +
    "funding, key products, pricing model, and headquarters.",
  parameters: searchCompaniesDeepParams,
  execute: async (
    _toolCallId,
    params: SearchCompaniesDeepParams,
    _signal,
    _onUpdate
  ) => {
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
    const numResults = params.num_results ?? 5;

    try {
      const response = await exa.search(params.query, {
        type: "deep",
        numResults,
        category: "company",
        outputSchema: COMPANIES_OUTPUT_SCHEMA,
      });

      const output = (response as any).output;
      if (!output) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No structured output returned from Exa deep search.",
            },
          ],
          details: { query: params.query },
        };
      }

      const contentText =
        typeof output.content === "string"
          ? output.content
          : JSON.stringify(output.content, null, 2);

      const groundingText =
        output.grounding && output.grounding.length > 0
          ? "\n\nGrounding citations:\n" +
            output.grounding
              .map(
                (g: any, i: number) =>
                  `[${i + 1}] ${g.citations
                    ?.map((c: any) => c.url || c.title || "(source)")
                    .join(", ") ?? "(no citations)"}`
              )
              .join("\n")
          : "";

      return {
        content: [
          {
            type: "text" as const,
            text:
              `Structured company data for "${params.query}":\n\n${contentText}` +
              groundingText,
          },
        ],
        details: {
          query: params.query,
          num_results: numResults,
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

// ---- searchFundingDeep --------------------------------------------------

const searchFundingDeepParams = Type.Object({
  query: Type.String({ description: "The search query for funding events" }),
  num_results: Type.Optional(
    Type.Number({ description: "Number of results to return (default 5)" })
  ),
});

type SearchFundingDeepParams = Static<typeof searchFundingDeepParams>;

// 9 properties total: funding_events (1) + 8 item properties = 9 (within limit).
const FUNDING_OUTPUT_SCHEMA = {
  type: "object" as const,
  required: ["funding_events"],
  properties: {
    funding_events: {
      type: "array",
      items: {
        type: "object",
        required: ["company"],
        properties: {
          company: { type: "string" },
          round: { type: "string" },
          amount: { type: "string" },
          date: { type: "string" },
          lead_investor: { type: "string" },
          co_investors: { type: "string" },
          valuation: { type: "string" },
          use_of_funds: { type: "string" },
        },
      },
    },
  },
};

export const searchFundingDeepTool: AgentTool<typeof searchFundingDeepParams> = {
  name: "search_funding_deep",
  label: "Search Funding Events (Deep Structured)",
  description:
    "Deep structured search for funding events. Uses Exa's deep news search with a JSON " +
    "output schema to extract funding rounds including company, round type, amount, date, " +
    "lead investor, co-investors, valuation, and use of funds.",
  parameters: searchFundingDeepParams,
  execute: async (
    _toolCallId,
    params: SearchFundingDeepParams,
    _signal,
    _onUpdate
  ) => {
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
    const numResults = params.num_results ?? 5;

    try {
      const response = await exa.search(params.query, {
        type: "deep",
        numResults,
        category: "news",
        outputSchema: FUNDING_OUTPUT_SCHEMA,
      });

      const output = (response as any).output;
      if (!output) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No structured output returned from Exa deep search.",
            },
          ],
          details: { query: params.query },
        };
      }

      const contentText =
        typeof output.content === "string"
          ? output.content
          : JSON.stringify(output.content, null, 2);

      const groundingText =
        output.grounding && output.grounding.length > 0
          ? "\n\nGrounding citations:\n" +
            output.grounding
              .map(
                (g: any, i: number) =>
                  `[${i + 1}] ${g.citations
                    ?.map((c: any) => c.url || c.title || "(source)")
                    .join(", ") ?? "(no citations)"}`
              )
              .join("\n")
          : "";

      return {
        content: [
          {
            type: "text" as const,
            text:
              `Structured funding events for "${params.query}":\n\n${contentText}` +
              groundingText,
          },
        ],
        details: {
          query: params.query,
          num_results: numResults,
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

// ---- exaStructuredExtract -----------------------------------------------

const exaStructuredExtractParams = Type.Object({
  query: Type.String({ description: "The search query" }),
  schema_description: Type.String({
    description:
      "Natural language description of what to extract (e.g. 'product names and their prices')",
  }),
  num_results: Type.Optional(
    Type.Number({ description: "Number of results to return (default 3)" })
  ),
});

type ExaStructuredExtractParams = Static<typeof exaStructuredExtractParams>;

// Generic schema: flat key-value pairs. Stays well within the 10-property limit.
const GENERIC_EXTRACT_SCHEMA = {
  type: "object" as const,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        required: ["key", "value"],
        properties: {
          key: { type: "string" },
          value: { type: "string" },
        },
      },
    },
  },
};

export const exaStructuredExtractTool: AgentTool<typeof exaStructuredExtractParams> = {
  name: "exa_structured_extract",
  label: "Exa Generic Structured Extract",
  description:
    "Generic structured extraction using Exa deep search. Describe what you want to extract " +
    "in schema_description (plain English) and the tool returns key-value pairs matching " +
    "that description. Useful for ad-hoc extraction when a dedicated tool does not exist.",
  parameters: exaStructuredExtractParams,
  execute: async (
    _toolCallId,
    params: ExaStructuredExtractParams,
    _signal,
    _onUpdate
  ) => {
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
    const numResults = params.num_results ?? 3;

    // Surface the schema_description as a system prompt so the model knows what to populate.
    const systemPrompt = `Extract the following from search results as key-value pairs: ${params.schema_description}`;

    try {
      const response = await exa.search(params.query, {
        type: "deep",
        numResults,
        outputSchema: GENERIC_EXTRACT_SCHEMA,
        systemPrompt,
      });

      const output = (response as any).output;
      if (!output) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No structured output returned from Exa deep search.",
            },
          ],
          details: { query: params.query },
        };
      }

      const contentText =
        typeof output.content === "string"
          ? output.content
          : JSON.stringify(output.content, null, 2);

      const groundingText =
        output.grounding && output.grounding.length > 0
          ? "\n\nGrounding citations:\n" +
            output.grounding
              .map(
                (g: any, i: number) =>
                  `[${i + 1}] ${g.citations
                    ?.map((c: any) => c.url || c.title || "(source)")
                    .join(", ") ?? "(no citations)"}`
              )
              .join("\n")
          : "";

      return {
        content: [
          {
            type: "text" as const,
            text:
              `Structured extraction for "${params.query}" (${params.schema_description}):\n\n${contentText}` +
              groundingText,
          },
        ],
        details: {
          query: params.query,
          schema_description: params.schema_description,
          num_results: numResults,
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
              : `Exa structured extract error: ${message}`,
          },
        ],
        details: { error: message, query: params.query },
      };
    }
  },
};
