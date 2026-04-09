import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";

// ---------------------------------------------------------------------------
// HTTP helper (mirrors brain.ts)
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
  console.info(`[brain-extended] convex ${type} ${path}`, { args });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, args }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "(no body)");
    console.error(`[brain-extended] convex ${type} ${path} failed`, {
      status: res.status,
      body: text,
    });
    throw new Error(`Convex ${type} "${path}" failed (${res.status}): ${text}`);
  }

  const json = await res.json();
  console.info(`[brain-extended] convex ${type} ${path} ok`);
  return "value" in json ? json.value : json;
}

// ---------------------------------------------------------------------------
// upsertInvestor
// ---------------------------------------------------------------------------

const UpsertInvestorSchema = Type.Object({
  name: Type.String({ description: "Investor or firm name" }),
  type: Type.String({ description: "Investor type, e.g. vc, angel, corporate, family_office" }),
  thesis: Type.Optional(Type.String({ description: "Investment thesis in plain text" })),
  check_size_min: Type.Optional(Type.Number({ description: "Minimum check size in USD" })),
  check_size_max: Type.Optional(Type.Number({ description: "Maximum check size in USD" })),
  focus_areas: Type.Optional(
    Type.Array(Type.String(), { description: "Market verticals or themes this investor focuses on" })
  ),
  source_urls: Type.Array(Type.String(), { description: "URLs where this data was sourced from" }),
  data_confidence: Type.String({ description: "Confidence level: high | medium | low" }),
});

type UpsertInvestorParams = Static<typeof UpsertInvestorSchema>;

export const upsertInvestorTool: AgentTool<typeof UpsertInvestorSchema> = {
  name: "upsertInvestor",
  label: "Upsert Investor",
  description:
    "Create or update an investor or VC firm record in the brain. " +
    "Matches on name - updates if found, inserts if new. Returns the investor id.",
  parameters: UpsertInvestorSchema,
  execute: async (_toolCallId, params: UpsertInvestorParams) => {
    const id = await convexCall(
      "mutation",
      "investors:upsert",
      params as Record<string, unknown>
    );

    const text = `Investor upserted - id: ${id}, name: "${params.name}", type: "${params.type}"`;
    return {
      content: [{ type: "text" as const, text }],
      details: { id, name: params.name, type: params.type },
    };
  },
};

// ---------------------------------------------------------------------------
// insertCompanyMetric
// ---------------------------------------------------------------------------

const InsertCompanyMetricSchema = Type.Object({
  company_id: Type.String({ description: "Convex company document ID" }),
  idea_id: Type.String({ description: "Convex ideas document ID" }),
  metric_type: Type.String({
    description: "Type of metric, e.g. revenue, arr, dau, mau, nps, employee_count",
  }),
  value: Type.Number({ description: "Numeric value of the metric" }),
  unit: Type.Optional(Type.String({ description: "Unit of the value, e.g. USD, count, percent" })),
  date: Type.String({ description: "ISO 8601 date string when this metric was observed, e.g. 2024-06-01" }),
  source_url: Type.Optional(Type.String({ description: "URL where this metric was found" })),
});

type InsertCompanyMetricParams = Static<typeof InsertCompanyMetricSchema>;

export const insertCompanyMetricTool: AgentTool<typeof InsertCompanyMetricSchema> = {
  name: "insertCompanyMetric",
  label: "Insert Company Metric",
  description:
    "Record a quantitative metric for a company (e.g. ARR, DAU, headcount). " +
    "Every data point is stored - no deduplication.",
  parameters: InsertCompanyMetricSchema,
  execute: async (_toolCallId, params: InsertCompanyMetricParams) => {
    const id = await convexCall(
      "mutation",
      "company_metrics:insert",
      params as Record<string, unknown>
    );

    const unitLabel = params.unit ? ` ${params.unit}` : "";
    const text = `Company metric inserted - id: ${id}, type: "${params.metric_type}", value: ${params.value}${unitLabel}, date: ${params.date}`;
    return {
      content: [{ type: "text" as const, text }],
      details: {
        id,
        company_id: params.company_id,
        metric_type: params.metric_type,
        value: params.value,
        unit: params.unit ?? null,
        date: params.date,
      },
    };
  },
};

// ---------------------------------------------------------------------------
// linkCompanyInvestor
// ---------------------------------------------------------------------------

const LinkCompanyInvestorSchema = Type.Object({
  investor_name: Type.String({ description: "Investor or firm name (used to look up the investor record)" }),
  company_name: Type.String({ description: "Company name (used to look up the company record)" }),
  idea_id: Type.String({ description: "Convex ideas document ID the company belongs to" }),
  round: Type.Optional(Type.String({ description: "Funding round, e.g. Seed, Series A, Series B" })),
  role: Type.Union(
    [Type.Literal("lead"), Type.Literal("participant")],
    { description: "Role in the round: lead or participant" }
  ),
});

type LinkCompanyInvestorParams = Static<typeof LinkCompanyInvestorSchema>;

export const linkCompanyInvestorTool: AgentTool<typeof LinkCompanyInvestorSchema> = {
  name: "linkCompanyInvestor",
  label: "Link Company to Investor",
  description:
    "Create a relationship between an investor and a company for a given round. " +
    "Takes names rather than IDs - the mutation resolves them internally.",
  parameters: LinkCompanyInvestorSchema,
  execute: async (_toolCallId, params: LinkCompanyInvestorParams) => {
    const id = await convexCall(
      "mutation",
      "company_investors:link",
      params as Record<string, unknown>
    );

    const roundLabel = params.round ? ` (${params.round})` : "";
    const text = `Company-investor link created - id: ${id}, investor: "${params.investor_name}", company: "${params.company_name}"${roundLabel}, role: ${params.role}`;
    return {
      content: [{ type: "text" as const, text }],
      details: {
        id,
        investor_name: params.investor_name,
        company_name: params.company_name,
        idea_id: params.idea_id,
        round: params.round ?? null,
        role: params.role,
      },
    };
  },
};
