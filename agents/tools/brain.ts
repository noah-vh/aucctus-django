import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

async function convexCall(
  type: "query" | "mutation",
  path: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const baseUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  }

  const url = `${baseUrl}/api/${type}`;
  console.info(`[brain] convex ${type} ${path}`, { args });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, args }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "(no body)");
    console.error(`[brain] convex ${type} ${path} failed`, {
      status: res.status,
      body: text,
    });
    throw new Error(`Convex ${type} "${path}" failed (${res.status}): ${text}`);
  }

  const json = await res.json();
  console.info(`[brain] convex ${type} ${path} ok`);
  // Convex HTTP API wraps successful results in { value: ... }
  return "value" in json ? json.value : json;
}

// ---------------------------------------------------------------------------
// queryBrain
// ---------------------------------------------------------------------------

const TABLE_QUERY_MAP: Record<string, { path: string; requiresIdeaId: boolean }> = {
  companies: { path: "brain:getCompaniesByIdea", requiresIdeaId: true },
  funding: { path: "brain:getFundingByIdea", requiresIdeaId: true },
  signals: { path: "brain:getSignalsByIdea", requiresIdeaId: true },
  verdicts: { path: "brain:getLatestVerdict", requiresIdeaId: true },
  ideas: { path: "brain:getIdeas", requiresIdeaId: false },
};

const QueryBrainSchema = Type.Object({
  table: Type.Union(
    [
      Type.Literal("companies"),
      Type.Literal("funding"),
      Type.Literal("signals"),
      Type.Literal("verdicts"),
      Type.Literal("ideas"),
    ],
    { description: "Which table to query" }
  ),
  idea_id: Type.Optional(
    Type.String({ description: "Convex ideas document ID - required for all tables except ideas" })
  ),
  limit: Type.Optional(
    Type.Number({ description: "Max records to return (default 50)", default: 50 })
  ),
});

export const queryBrain: AgentTool<typeof QueryBrainSchema> = {
  name: "queryBrain",
  label: "Query Brain",
  description:
    "Read records from the Aucctus brain (Convex database). " +
    "Choose a table: companies, funding, signals, verdicts, or ideas. " +
    "Most tables require an idea_id. The ideas table does not.",
  parameters: QueryBrainSchema,
  execute: async (_toolCallId, params) => {
    const { table, idea_id, limit = 50 } = params;

    const mapping = TABLE_QUERY_MAP[table];
    if (!mapping) {
      throw new Error(`Unknown table: ${table}`);
    }

    if (mapping.requiresIdeaId && !idea_id) {
      throw new Error(`Table "${table}" requires idea_id`);
    }

    const args: Record<string, unknown> = mapping.requiresIdeaId
      ? { idea_id }
      : {};

    const raw = await convexCall("query", mapping.path, args);

    // Normalize to array, then apply limit
    const rows = Array.isArray(raw) ? raw : raw !== null && raw !== undefined ? [raw] : [];
    const sliced = rows.slice(0, limit);

    const text =
      sliced.length === 0
        ? `No records found in "${table}"${idea_id ? ` for idea_id ${idea_id}` : ""}.`
        : JSON.stringify(sliced, null, 2);

    return {
      content: [{ type: "text" as const, text }],
      details: sliced,
    };
  },
};

// ---------------------------------------------------------------------------
// upsertCompanyTool
// ---------------------------------------------------------------------------

const UpsertCompanySchema = Type.Object({
  idea_id: Type.String({ description: "Convex ideas document ID" }),
  name: Type.String({ description: "Company name" }),
  url: Type.Optional(Type.String({ description: "Company website URL" })),
  description: Type.Optional(Type.String({ description: "Short company description" })),
  product_names: Type.Array(Type.String(), { description: "Names of their products" }),
  features: Type.Array(Type.String(), { description: "Key product features" }),
  pricing_model: Type.Optional(Type.String({ description: "e.g. freemium, subscription, usage-based" })),
  target_segment: Type.Optional(Type.String({ description: "Target customer segment" })),
  differentiator: Type.Optional(Type.String({ description: "Key differentiator vs competitors" })),
  weakness: Type.Optional(Type.String({ description: "Notable weakness or gap" })),
  employee_estimate: Type.Optional(Type.Number({ description: "Estimated headcount" })),
  founded_year: Type.Optional(Type.Number({ description: "Year the company was founded" })),
  data_confidence: Type.String({ description: "Confidence level: high | medium | low" }),
  source_urls: Type.Array(Type.String(), { description: "URLs where this data was sourced from" }),
});

type UpsertCompanyParams = Static<typeof UpsertCompanySchema>;

export const upsertCompanyTool: AgentTool<typeof UpsertCompanySchema> = {
  name: "upsertCompany",
  label: "Upsert Company",
  description:
    "Create or update a competitor/company record for a given idea. " +
    "Matches on (name, idea_id) - updates if found, inserts if new.",
  parameters: UpsertCompanySchema,
  execute: async (_toolCallId, params: UpsertCompanyParams) => {
    const id = await convexCall("mutation", "brain:upsertCompany", params as Record<string, unknown>);

    const text = `Company upserted - id: ${id}, name: "${params.name}"`;
    return {
      content: [{ type: "text" as const, text }],
      details: { id, name: params.name },
    };
  },
};

// ---------------------------------------------------------------------------
// insertFundingTool
// ---------------------------------------------------------------------------

const InsertFundingSchema = Type.Object({
  idea_id: Type.String({ description: "Convex ideas document ID" }),
  company_name: Type.String({ description: "Company name as a string (used for dedup)" }),
  round: Type.String({ description: "Funding round, e.g. Seed, Series A, Series B" }),
  amount_usd: Type.Optional(Type.Number({ description: "Amount raised in USD" })),
  date: Type.String({ description: "ISO 8601 date string, e.g. 2024-03-15" }),
  lead_investor: Type.Optional(Type.String({ description: "Lead investor name" })),
  co_investors: Type.Array(Type.String(), { description: "List of co-investor names" }),
  source_url: Type.String({ description: "URL where this funding data was found" }),
  data_confidence: Type.String({ description: "Confidence level: high | medium | low" }),
});

type InsertFundingParams = Static<typeof InsertFundingSchema>;

export const insertFundingTool: AgentTool<typeof InsertFundingSchema> = {
  name: "insertFunding",
  label: "Insert Funding Event",
  description:
    "Record a funding event for a company. Deduplicates on (company_name, round, date, idea_id) - " +
    "returns null if the record already exists.",
  parameters: InsertFundingSchema,
  execute: async (_toolCallId, params: InsertFundingParams) => {
    const id = await convexCall("mutation", "brain:insertFunding", params as Record<string, unknown>);

    const text =
      id === null
        ? `Duplicate skipped - funding for "${params.company_name}" round "${params.round}" on ${params.date} already exists.`
        : `Funding event inserted - id: ${id}, company: "${params.company_name}", round: ${params.round}`;

    return {
      content: [{ type: "text" as const, text }],
      details: { id, company_name: params.company_name, round: params.round },
    };
  },
};

// ---------------------------------------------------------------------------
// insertSignalTool
// ---------------------------------------------------------------------------

const InsertSignalSchema = Type.Object({
  idea_id: Type.String({ description: "Convex ideas document ID" }),
  signal_type: Type.String({
    description: "Signal category, e.g. job_postings, review_count, pricing_change, news_mention",
  }),
  value: Type.String({ description: "The signal value as a string" }),
  unit: Type.Optional(Type.String({ description: "Optional unit, e.g. USD, count, percent" })),
  source_url: Type.String({ description: "URL where this signal was observed" }),
  source_credibility: Type.String({ description: "Credibility of the source: high | medium | low" }),
  date: Type.Optional(Type.String({ description: "ISO 8601 date when the signal was observed" })),
});

type InsertSignalParams = Static<typeof InsertSignalSchema>;

export const insertSignalTool: AgentTool<typeof InsertSignalSchema> = {
  name: "insertSignal",
  label: "Insert Market Signal",
  description:
    "Record a market signal (e.g. job posting count, review volume, pricing change) for an idea. " +
    "No deduplication - every data point is recorded.",
  parameters: InsertSignalSchema,
  execute: async (_toolCallId, params: InsertSignalParams) => {
    const id = await convexCall("mutation", "brain:insertSignal", params as Record<string, unknown>);

    const text = `Signal inserted - id: ${id}, type: "${params.signal_type}", value: "${params.value}"`;
    return {
      content: [{ type: "text" as const, text }],
      details: { id, signal_type: params.signal_type, value: params.value },
    };
  },
};

// ---------------------------------------------------------------------------
// createIdeaTool
// ---------------------------------------------------------------------------

const CreateIdeaSchema = Type.Object({
  description: Type.String({ description: "Clear description of the market idea or opportunity" }),
  tags: Type.Optional(
    Type.Array(Type.String(), { description: "Optional tags for categorization" })
  ),
});

type CreateIdeaParams = Static<typeof CreateIdeaSchema>;

export const createIdeaTool: AgentTool<typeof CreateIdeaSchema> = {
  name: "createIdea",
  label: "Create Idea",
  description: "Create a new market idea to research. Returns the new idea_id.",
  parameters: CreateIdeaSchema,
  execute: async (_toolCallId, params: CreateIdeaParams) => {
    const id = await convexCall("mutation", "brain:createIdea", params as Record<string, unknown>);

    const text = `Idea created - id: ${id}`;
    return {
      content: [{ type: "text" as const, text }],
      details: { id },
    };
  },
};
