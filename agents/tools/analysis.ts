import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { convexCall } from "../shared/api";

// ---------------------------------------------------------------------------
// Internal types for brain records
// ---------------------------------------------------------------------------

interface Company {
  _id: string;
  name: string;
  features?: string[];
  data_confidence?: string;
  [key: string]: unknown;
}

interface FundingEvent {
  _id: string;
  company_name: string;
  amount_usd?: number;
  date?: string;
  round?: string;
  data_confidence?: string;
  [key: string]: unknown;
}

interface MarketSignal {
  _id: string;
  signal_type: string;
  value: string;
  date?: string;
  data_confidence?: string;
  [key: string]: unknown;
}

interface Idea {
  _id: string;
  description: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// compareFeatures
// ---------------------------------------------------------------------------

const CompareFeaturesSchema = Type.Object({
  idea_id: Type.String({ description: "Convex ideas document ID" }),
});

type CompareFeaturesParams = Static<typeof CompareFeaturesSchema>;

export const compareFeaturesTool: AgentTool<typeof CompareFeaturesSchema> = {
  name: "compareFeatures",
  label: "Compare Features",
  description:
    "Build a feature matrix for all companies in a given idea. " +
    "Identifies shared features (all companies have), unique features (only one company has), " +
    "and gap features (no company has well).",
  parameters: CompareFeaturesSchema,
  execute: async (_toolCallId, params: CompareFeaturesParams) => {
    const { idea_id } = params;

    const raw = await convexCall("query", "brain:getCompaniesByIdea", { idea_id });
    const companies = (Array.isArray(raw) ? raw : raw ? [raw] : []) as Company[];

    if (companies.length === 0) {
      return {
        content: [{ type: "text" as const, text: `No companies found for idea_id ${idea_id}.` }],
        details: { idea_id, companies: 0 },
      };
    }

    // Build feature -> set of company names map
    const featureMap = new Map<string, Set<string>>();
    for (const company of companies) {
      const features = Array.isArray(company.features) ? company.features : [];
      for (const feature of features) {
        if (!featureMap.has(feature)) {
          featureMap.set(feature, new Set());
        }
        featureMap.get(feature)!.add(company.name);
      }
    }

    const companyNames = companies.map((c) => c.name);
    const totalCompanies = companies.length;

    const sharedFeatures: string[] = [];
    const uniqueFeatures: Array<{ feature: string; company: string }> = [];
    const partialFeatures: Array<{ feature: string; companies: string[] }> = [];

    for (const [feature, owners] of featureMap.entries()) {
      if (owners.size === totalCompanies) {
        sharedFeatures.push(feature);
      } else if (owners.size === 1) {
        uniqueFeatures.push({ feature, company: [...owners][0] });
      } else {
        partialFeatures.push({ feature, companies: [...owners] });
      }
    }

    // Gap detection: any company with no features listed
    const gapCompanies = companies
      .filter((c) => !Array.isArray(c.features) || c.features.length === 0)
      .map((c) => c.name);

    // Build matrix text
    const allFeatures = [...featureMap.keys()].sort();
    const headerRow = ["Feature", ...companyNames].join(" | ");
    const divider = allFeatures.length > 0
      ? "-".repeat(headerRow.length)
      : "";

    const matrixRows = allFeatures.map((feature) => {
      const owners = featureMap.get(feature)!;
      const cols = companyNames.map((name) => (owners.has(name) ? "YES" : "no"));
      return [feature, ...cols].join(" | ");
    });

    const matrixSection =
      allFeatures.length > 0
        ? [`Feature Matrix:`, headerRow, divider, ...matrixRows].join("\n")
        : "No feature data found across companies.";

    const sharedSection =
      sharedFeatures.length > 0
        ? `Shared features (all companies): ${sharedFeatures.join(", ")}`
        : "No features shared by all companies.";

    const uniqueSection =
      uniqueFeatures.length > 0
        ? `Unique features:\n${uniqueFeatures.map((u) => `  - ${u.feature} (only: ${u.company})`).join("\n")}`
        : "No unique features found.";

    const gapSection =
      gapCompanies.length > 0
        ? `Companies with no feature data (gap): ${gapCompanies.join(", ")}`
        : "";

    const text = [
      `Feature Comparison for idea ${idea_id}`,
      `Companies analyzed: ${companyNames.join(", ")}`,
      "",
      matrixSection,
      "",
      sharedSection,
      uniqueSection,
      gapSection,
    ]
      .filter((line) => line !== undefined)
      .join("\n");

    const structured = {
      idea_id,
      companies: companyNames,
      feature_matrix: Object.fromEntries(
        allFeatures.map((f) => [
          f,
          Object.fromEntries(companyNames.map((n) => [n, featureMap.get(f)!.has(n)])),
        ])
      ),
      shared_features: sharedFeatures,
      unique_features: uniqueFeatures,
      partial_features: partialFeatures,
      gap_companies: gapCompanies,
    };

    return {
      content: [{ type: "text" as const, text }],
      details: structured,
    };
  },
};

// ---------------------------------------------------------------------------
// computeTrends
// ---------------------------------------------------------------------------

const ComputeTrendsSchema = Type.Object({
  idea_id: Type.String({ description: "Convex ideas document ID" }),
});

type ComputeTrendsParams = Static<typeof ComputeTrendsSchema>;

export const computeTrendsTool: AgentTool<typeof ComputeTrendsSchema> = {
  name: "computeTrends",
  label: "Compute Trends",
  description:
    "Analyze market signals for an idea. Groups signals by type and determines directional trends " +
    "based on values over time.",
  parameters: ComputeTrendsSchema,
  execute: async (_toolCallId, params: ComputeTrendsParams) => {
    const { idea_id } = params;

    const raw = await convexCall("query", "brain:getSignalsByIdea", { idea_id });
    const signals = (Array.isArray(raw) ? raw : raw ? [raw] : []) as MarketSignal[];

    if (signals.length === 0) {
      return {
        content: [{ type: "text" as const, text: `No market signals found for idea_id ${idea_id}.` }],
        details: { idea_id, signal_count: 0 },
      };
    }

    // Group signals by type
    const byType = new Map<string, MarketSignal[]>();
    for (const signal of signals) {
      if (!byType.has(signal.signal_type)) {
        byType.set(signal.signal_type, []);
      }
      byType.get(signal.signal_type)!.push(signal);
    }

    const trendSections: string[] = [];
    const trendData: Record<string, { count: number; direction: string; values: string[] }> = {};

    for (const [signalType, typeSignals] of byType.entries()) {
      // Sort by date ascending if dates present
      const sorted = [...typeSignals].sort((a, b) => {
        if (!a.date || !b.date) return 0;
        return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
      });

      const values = sorted.map((s) => s.value);
      const numericValues = values
        .map((v) => parseFloat(v))
        .filter((n) => !isNaN(n));

      let direction = "stable";
      if (numericValues.length >= 2) {
        const first = numericValues[0];
        const last = numericValues[numericValues.length - 1];
        const changePct = ((last - first) / Math.abs(first || 1)) * 100;
        if (changePct > 10) direction = "up";
        else if (changePct < -10) direction = "down";
        else direction = "stable";
      } else if (numericValues.length < 2 && values.length >= 2) {
        // Non-numeric values - can't determine direction
        direction = "mixed (non-numeric)";
      }

      const dateRange =
        sorted[0]?.date && sorted[sorted.length - 1]?.date
          ? `${sorted[0].date} to ${sorted[sorted.length - 1].date}`
          : "dates not available";

      trendSections.push(
        [
          `Signal type: ${signalType}`,
          `  Data points: ${typeSignals.length}`,
          `  Direction: ${direction}`,
          `  Date range: ${dateRange}`,
          `  Values: ${values.slice(0, 5).join(", ")}${values.length > 5 ? ` ... (${values.length - 5} more)` : ""}`,
        ].join("\n")
      );

      trendData[signalType] = { count: typeSignals.length, direction, values };
    }

    const text = [
      `Trend Analysis for idea ${idea_id}`,
      `Total signals: ${signals.length}, signal types: ${byType.size}`,
      "",
      ...trendSections,
    ].join("\n\n");

    return {
      content: [{ type: "text" as const, text }],
      details: { idea_id, signal_count: signals.length, trends: trendData },
    };
  },
};

// ---------------------------------------------------------------------------
// assessEvidenceQuality
// ---------------------------------------------------------------------------

const AssessEvidenceQualitySchema = Type.Object({
  idea_id: Type.String({ description: "Convex ideas document ID" }),
});

type AssessEvidenceQualityParams = Static<typeof AssessEvidenceQualitySchema>;

// All known signal types used as the denominator for diversity score
const KNOWN_SIGNAL_TYPES = [
  "job_postings",
  "review_count",
  "pricing_change",
  "news_mention",
  "funding_announcement",
  "product_launch",
  "hiring_trend",
];

function confidenceToNumber(c: string | undefined): number {
  if (c === "high") return 1.0;
  if (c === "medium") return 0.6;
  if (c === "low") return 0.3;
  return 0.5; // unknown defaults to mid
}

export const assessEvidenceQualityTool: AgentTool<typeof AssessEvidenceQualitySchema> = {
  name: "assessEvidenceQuality",
  label: "Assess Evidence Quality",
  description:
    "Compute a quality scorecard for the evidence collected for an idea. " +
    "Returns coverage, recency, diversity, and confidence scores, plus a list of gaps.",
  parameters: AssessEvidenceQualitySchema,
  execute: async (_toolCallId, params: AssessEvidenceQualityParams) => {
    const { idea_id } = params;

    const [rawCompanies, rawFunding, rawSignals] = await Promise.all([
      convexCall("query", "brain:getCompaniesByIdea", { idea_id }),
      convexCall("query", "brain:getFundingByIdea", { idea_id }),
      convexCall("query", "brain:getSignalsByIdea", { idea_id }),
    ]);

    const companies = (Array.isArray(rawCompanies) ? rawCompanies : rawCompanies ? [rawCompanies] : []) as Company[];
    const funding = (Array.isArray(rawFunding) ? rawFunding : rawFunding ? [rawFunding] : []) as FundingEvent[];
    const signals = (Array.isArray(rawSignals) ? rawSignals : rawSignals ? [rawSignals] : []) as MarketSignal[];

    // Coverage score: 0-10 companies maps to 0-100
    const coverageScore = Math.min(companies.length * 10, 100);

    // Recency score: % of data points with a date in the last 12 months
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
    const cutoffIso = twelveMonthsAgo.toISOString().slice(0, 10);

    const allDated: string[] = [
      ...signals.map((s) => s.date ?? ""),
      ...funding.map((f) => f.date ?? ""),
    ].filter(Boolean);

    const recentCount = allDated.filter((d) => d >= cutoffIso).length;
    const recencyScore =
      allDated.length > 0 ? Math.round((recentCount / allDated.length) * 100) : 0;

    // Diversity score: how many of the 7 known signal types are represented
    const presentTypes = new Set(signals.map((s) => s.signal_type));
    const diversityScore = Math.round((presentTypes.size / KNOWN_SIGNAL_TYPES.length) * 100);

    // Confidence score: average across all entities
    const allConfidences = [
      ...companies.map((c) => confidenceToNumber(c.data_confidence as string | undefined)),
      ...funding.map((f) => confidenceToNumber(f.data_confidence as string | undefined)),
      ...signals.map((s) => confidenceToNumber(s.data_confidence as string | undefined)),
    ];
    const confidenceScore =
      allConfidences.length > 0
        ? Math.round((allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length) * 100)
        : 0;

    // Gap detection
    const gaps: string[] = [];
    if (companies.length === 0) gaps.push("No companies found");
    if (funding.length === 0) gaps.push("No funding data");
    if (signals.length === 0) gaps.push("No market signals");

    for (const knownType of KNOWN_SIGNAL_TYPES) {
      if (!presentTypes.has(knownType)) {
        gaps.push(`No ${knownType} data`);
      }
    }

    const hasTam = signals.some((s) =>
      s.signal_type.toLowerCase().includes("tam") ||
      s.signal_type.toLowerCase().includes("market_size")
    );
    if (!hasTam) gaps.push("No TAM / market size data");

    const hasHiring = presentTypes.has("job_postings") || presentTypes.has("hiring_trend");
    if (!hasHiring) gaps.push("No hiring data");

    const overallScore = Math.round(
      (coverageScore + recencyScore + diversityScore + confidenceScore) / 4
    );

    const text = [
      `Evidence Quality Assessment for idea ${idea_id}`,
      "",
      `Overall score:    ${overallScore}/100`,
      `Coverage score:   ${coverageScore}/100  (companies found: ${companies.length})`,
      `Recency score:    ${recencyScore}/100  (data from last 12 months: ${recentCount}/${allDated.length} data points)`,
      `Diversity score:  ${diversityScore}/100  (signal types present: ${presentTypes.size}/${KNOWN_SIGNAL_TYPES.length})`,
      `Confidence score: ${confidenceScore}/100  (avg across ${allConfidences.length} entities)`,
      "",
      gaps.length > 0
        ? `Gaps identified (${gaps.length}):\n${gaps.map((g) => `  - ${g}`).join("\n")}`
        : "No significant gaps detected.",
    ].join("\n");

    return {
      content: [{ type: "text" as const, text }],
      details: {
        idea_id,
        scores: {
          overall: overallScore,
          coverage: coverageScore,
          recency: recencyScore,
          diversity: diversityScore,
          confidence: confidenceScore,
        },
        counts: {
          companies: companies.length,
          funding_events: funding.length,
          signals: signals.length,
        },
        gaps,
      },
    };
  },
};

// ---------------------------------------------------------------------------
// crossIdeaCompare
// ---------------------------------------------------------------------------

const CrossIdeaCompareSchema = Type.Object({});

export const crossIdeaCompareTool: AgentTool<typeof CrossIdeaCompareSchema> = {
  name: "crossIdeaCompare",
  label: "Cross-Idea Compare",
  description:
    "Compare all ideas in the brain. For each idea, summarizes companies and funding totals. " +
    "Identifies companies and investors appearing in multiple ideas.",
  parameters: CrossIdeaCompareSchema,
  execute: async (_toolCallId, _params) => {
    const rawIdeas = await convexCall("query", "brain:getIdeas", {});
    const ideas = (Array.isArray(rawIdeas) ? rawIdeas : rawIdeas ? [rawIdeas] : []) as Idea[];

    if (ideas.length === 0) {
      return {
        content: [{ type: "text" as const, text: "No ideas found in the brain." }],
        details: { idea_count: 0 },
      };
    }

    // Fetch companies and funding for all ideas in parallel
    const ideaData = await Promise.all(
      ideas.map(async (idea) => {
        const [rawCompanies, rawFunding] = await Promise.all([
          convexCall("query", "brain:getCompaniesByIdea", { idea_id: idea._id }).catch(() => []),
          convexCall("query", "brain:getFundingByIdea", { idea_id: idea._id }).catch(() => []),
        ]);

        const companies = (Array.isArray(rawCompanies) ? rawCompanies : rawCompanies ? [rawCompanies] : []) as Company[];
        const funding = (Array.isArray(rawFunding) ? rawFunding : rawFunding ? [rawFunding] : []) as FundingEvent[];

        const totalFunding = funding.reduce((sum, f) => sum + (f.amount_usd ?? 0), 0);
        const leadInvestors = funding
          .map((f) => (f as Record<string, unknown>).lead_investor as string | undefined)
          .filter((v): v is string => Boolean(v));

        return {
          idea,
          companies,
          funding,
          totalFunding,
          leadInvestors,
        };
      })
    );

    // Find companies appearing in multiple ideas
    const companyIdeaMap = new Map<string, string[]>();
    for (const { idea, companies } of ideaData) {
      for (const company of companies) {
        const key = company.name.toLowerCase();
        if (!companyIdeaMap.has(key)) {
          companyIdeaMap.set(key, []);
        }
        companyIdeaMap.get(key)!.push(idea._id);
      }
    }

    const crossCompanies = [...companyIdeaMap.entries()]
      .filter(([, ideaIds]) => ideaIds.length > 1)
      .map(([name, ideaIds]) => ({ name, idea_count: ideaIds.length, idea_ids: ideaIds }));

    // Find investors appearing in multiple ideas
    const investorIdeaMap = new Map<string, string[]>();
    for (const { idea, leadInvestors } of ideaData) {
      for (const investor of leadInvestors) {
        const key = investor.toLowerCase();
        if (!investorIdeaMap.has(key)) {
          investorIdeaMap.set(key, []);
        }
        investorIdeaMap.get(key)!.push(idea._id);
      }
    }

    const crossInvestors = [...investorIdeaMap.entries()]
      .filter(([, ideaIds]) => ideaIds.length > 1)
      .map(([name, ideaIds]) => ({ name, idea_count: ideaIds.length, idea_ids: ideaIds }));

    // Format output
    const ideaSections = ideaData.map(({ idea, companies, totalFunding }) => {
      const companyNames = companies.map((c) => c.name);
      const fundingStr =
        totalFunding > 0
          ? `$${(totalFunding / 1_000_000).toFixed(1)}M total funding`
          : "no funding data";
      return [
        `Idea: ${idea._id}`,
        `  Description: ${(idea.description as string).slice(0, 120)}`,
        `  Companies (${companies.length}): ${companyNames.slice(0, 8).join(", ")}${companies.length > 8 ? ` ... +${companies.length - 8} more` : ""}`,
        `  Funding: ${fundingStr}`,
      ].join("\n");
    });

    const crossCompanySection =
      crossCompanies.length > 0
        ? `Companies in multiple ideas:\n${crossCompanies.map((c) => `  - ${c.name} (${c.idea_count} ideas)`).join("\n")}`
        : "No companies appear in multiple ideas.";

    const crossInvestorSection =
      crossInvestors.length > 0
        ? `Investors in multiple ideas:\n${crossInvestors.map((i) => `  - ${i.name} (${i.idea_count} ideas)`).join("\n")}`
        : "No investors appear in multiple ideas.";

    const text = [
      `Cross-Idea Comparison (${ideas.length} ideas)`,
      "",
      ...ideaSections,
      "",
      crossCompanySection,
      "",
      crossInvestorSection,
    ].join("\n\n");

    return {
      content: [{ type: "text" as const, text }],
      details: {
        idea_count: ideas.length,
        cross_companies: crossCompanies,
        cross_investors: crossInvestors,
      },
    };
  },
};
