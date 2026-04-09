/**
 * Aucctus Market Intelligence System - Schema Definitions
 *
 * SINGLE SOURCE OF TRUTH for all data shapes in the system.
 * All schemas defined with TypeBox for runtime validation + static type inference.
 */
import { type Static, Type } from "@sinclair/typebox";

// ---------------------------------------------------------------------------
// Shared enums
// ---------------------------------------------------------------------------

const DataConfidence = Type.Union(
  [Type.Literal("high"), Type.Literal("medium"), Type.Literal("low")],
  { description: "Confidence level for data sourced from research" }
);

const FundingRound = Type.Union([
  Type.Literal("pre-seed"),
  Type.Literal("seed"),
  Type.Literal("A"),
  Type.Literal("B"),
  Type.Literal("C"),
  Type.Literal("D"),
  Type.Literal("growth"),
  Type.Literal("acquisition"),
  Type.Literal("unknown"),
]);

const MarketClassification = Type.Union([
  Type.Literal("open"),
  Type.Literal("moderate"),
  Type.Literal("crowded"),
  Type.Literal("dominated"),
]);

const FundingTrend = Type.Union([
  Type.Literal("accelerating"),
  Type.Literal("stable"),
  Type.Literal("decelerating"),
  Type.Literal("insufficient_data"),
]);

const SpaceMaturity = Type.Union([
  Type.Literal("early"),
  Type.Literal("growth"),
  Type.Literal("mature"),
  Type.Literal("declining"),
]);

const GrowthTrend = Type.Union([
  Type.Literal("accelerating"),
  Type.Literal("steady"),
  Type.Literal("decelerating"),
  Type.Literal("emerging"),
  Type.Literal("declining"),
  Type.Literal("uncertain"),
]);

const Recommendation = Type.Union([
  Type.Literal("pursue"),
  Type.Literal("watch"),
  Type.Literal("pass"),
]);

const Timing = Type.Union([
  Type.Literal("too_early"),
  Type.Literal("early"),
  Type.Literal("right_time"),
  Type.Literal("late"),
]);

const CompetitiveDensity = Type.Union([
  Type.Literal("open"),
  Type.Literal("moderate"),
  Type.Literal("crowded"),
  Type.Literal("dominated"),
]);

const FundingSignal = Type.Union([
  Type.Literal("hot"),
  Type.Literal("warming"),
  Type.Literal("stable"),
  Type.Literal("cooling"),
]);

const GrowthSignal = Type.Union([
  Type.Literal("accelerating"),
  Type.Literal("steady"),
  Type.Literal("decelerating"),
  Type.Literal("uncertain"),
]);

const IntelSignalType = Type.Union([
  Type.Literal("new_entrant"),
  Type.Literal("acquisition"),
  Type.Literal("pivot"),
  Type.Literal("funding_spike"),
  Type.Literal("funding_drought"),
  Type.Literal("growth_acceleration"),
  Type.Literal("growth_stall"),
  Type.Literal("new_category_entrant"),
]);

const Severity = Type.Union([
  Type.Literal("high"),
  Type.Literal("medium"),
  Type.Literal("low"),
]);

const JobType = Type.Union([
  Type.Literal("full_rescan"),
  Type.Literal("funding_pulse"),
  Type.Literal("news_monitor"),
  Type.Literal("hiring_velocity"),
  Type.Literal("stale_check"),
  Type.Literal("signal_digest"),
]);

const TargetType = Type.Union([
  Type.Literal("idea"),
  Type.Literal("company"),
  Type.Literal("global"),
]);

const JobStatus = Type.Union([
  Type.Literal("pending"),
  Type.Literal("running"),
  Type.Literal("completed"),
  Type.Literal("failed"),
]);

const TriggeredBy = Type.Union([
  Type.Literal("cron"),
  Type.Literal("manual"),
  Type.Literal("event"),
]);

const EntityType = Type.Union([
  Type.Literal("idea"),
  Type.Literal("company"),
  Type.Literal("funding_event"),
  Type.Literal("signal"),
]);

const ActivityType = Type.Union([
  Type.Literal("research_run"),
  Type.Literal("funding_detected"),
  Type.Literal("news_alert"),
  Type.Literal("verdict_changed"),
  Type.Literal("company_updated"),
  Type.Literal("signal_generated"),
  Type.Literal("job_completed"),
]);

const ActivitySource = Type.Union([
  Type.Literal("full_rescan"),
  Type.Literal("funding_pulse"),
  Type.Literal("news_monitor"),
  Type.Literal("manual"),
  Type.Literal("event"),
]);

const MarketSignalType = Type.Union([
  Type.Literal("tam_estimate"),
  Type.Literal("growth_rate"),
  Type.Literal("hiring_trend"),
  Type.Literal("search_trend"),
  Type.Literal("analyst_report"),
  Type.Literal("earnings_mention"),
  Type.Literal("organic_demand"),
]);

const SourceCredibility = Type.Union([
  Type.Literal("high"),
  Type.Literal("medium"),
  Type.Literal("low"),
]);

// ---------------------------------------------------------------------------
// Core Entities
// ---------------------------------------------------------------------------

/** A company tracked in the competitive landscape */
export const CompanySchema = Type.Object(
  {
    name: Type.String(),
    url: Type.Optional(Type.String()),
    description: Type.Optional(Type.String()),
    product_names: Type.Array(Type.String()),
    features: Type.Array(Type.String()),
    pricing_model: Type.Optional(Type.String()),
    target_segment: Type.Optional(Type.String()),
    differentiator: Type.Optional(Type.String()),
    weakness: Type.Optional(Type.String()),
    employee_estimate: Type.Optional(Type.Number()),
    founded_year: Type.Optional(Type.Number()),
    headquarters: Type.Optional(Type.String()),
    data_confidence: DataConfidence,
    source_urls: Type.Array(Type.String()),
  },
  { $id: "Company", description: "A company tracked in the competitive landscape" }
);
export type Company = Static<typeof CompanySchema>;

/** A funding event for a tracked company */
export const FundingEventSchema = Type.Object(
  {
    company: Type.String(),
    round: FundingRound,
    amount_usd: Type.Optional(Type.Number()),
    date: Type.String(),
    lead_investor: Type.Optional(Type.String()),
    co_investors: Type.Array(Type.String()),
    source_url: Type.String(),
    data_confidence: DataConfidence,
  },
  { $id: "FundingEvent", description: "A funding event for a tracked company" }
);
export type FundingEvent = Static<typeof FundingEventSchema>;

/** A market signal - quantitative or qualitative data point about market dynamics */
export const MarketSignalSchema = Type.Object(
  {
    signal_type: MarketSignalType,
    value: Type.String(),
    unit: Type.Optional(Type.String()),
    source_url: Type.String(),
    source_credibility: SourceCredibility,
    date: Type.Optional(Type.String()),
  },
  { $id: "MarketSignal", description: "A market signal data point about market dynamics" }
);
export type MarketSignal = Static<typeof MarketSignalSchema>;

// ---------------------------------------------------------------------------
// New Entity Schemas
// ---------------------------------------------------------------------------

const InvestorType = Type.Union([
  Type.Literal("vc"),
  Type.Literal("angel"),
  Type.Literal("pe"),
  Type.Literal("corporate"),
  Type.Literal("accelerator"),
]);

const MetricType = Type.Union([
  Type.Literal("revenue_estimate"),
  Type.Literal("employee_count"),
  Type.Literal("job_postings"),
  Type.Literal("web_traffic"),
  Type.Literal("social_followers"),
]);

const TrendType = Type.Union([
  Type.Literal("tam_trajectory"),
  Type.Literal("funding_momentum"),
  Type.Literal("hiring_velocity"),
  Type.Literal("search_interest"),
  Type.Literal("sentiment"),
]);

const TrendDirection = Type.Union([
  Type.Literal("accelerating"),
  Type.Literal("steady"),
  Type.Literal("decelerating"),
  Type.Literal("emerging"),
  Type.Literal("declining"),
]);

/** An investor tracked in the funding landscape */
export const InvestorSchema = Type.Object(
  {
    name: Type.String(),
    type: InvestorType,
    thesis: Type.Optional(Type.String()),
    check_size_min: Type.Optional(Type.Number()),
    check_size_max: Type.Optional(Type.Number()),
    focus_areas: Type.Optional(Type.Array(Type.String())),
    portfolio_count: Type.Optional(Type.Number()),
    notable_portfolio: Type.Optional(Type.Array(Type.String())),
    source_urls: Type.Array(Type.String()),
    data_confidence: DataConfidence,
  },
  { $id: "Investor", description: "An investor tracked in the funding landscape" }
);
export type Investor = Static<typeof InvestorSchema>;

/** A quantitative metric snapshot for a company */
export const CompanyMetricSchema = Type.Object(
  {
    metric_type: MetricType,
    value: Type.Number(),
    unit: Type.Optional(Type.String()),
    date: Type.String(),
    source_url: Type.Optional(Type.String()),
  },
  { $id: "CompanyMetric", description: "A quantitative metric snapshot for a company" }
);
export type CompanyMetric = Static<typeof CompanyMetricSchema>;

/** A detected trend in the market landscape */
export const MarketTrendSchema = Type.Object(
  {
    trend_type: TrendType,
    direction: TrendDirection,
    data_points: Type.Number(),
    confidence: Type.Number({ minimum: 0, maximum: 100 }),
    period: Type.Optional(Type.String()),
    description: Type.String(),
  },
  { $id: "MarketTrend", description: "A detected trend in the market landscape" }
);
export type MarketTrend = Static<typeof MarketTrendSchema>;

/** Quality assessment of research coverage and recency */
export const ResearchQualitySchema = Type.Object(
  {
    overall_score: Type.Number({ minimum: 0, maximum: 100 }),
    coverage_score: Type.Number({ minimum: 0, maximum: 100 }),
    recency_score: Type.Number({ minimum: 0, maximum: 100 }),
    diversity_score: Type.Number({ minimum: 0, maximum: 100 }),
    confidence_score: Type.Number({ minimum: 0, maximum: 100 }),
    gaps: Type.Array(Type.String()),
    recommendations: Type.Array(Type.String()),
    stale_items: Type.Number(),
  },
  { $id: "ResearchQuality", description: "Quality assessment of research coverage and recency" }
);
export type ResearchQuality = Static<typeof ResearchQualitySchema>;

/** Feature comparison matrix across competing companies */
export const FeatureMatrixSchema = Type.Object(
  {
    matrix: Type.Record(Type.String(), Type.Record(Type.String(), Type.Boolean())),
    shared_features: Type.Array(Type.String()),
    gap_features: Type.Array(Type.String()),
    companies_compared: Type.Array(Type.String()),
  },
  { $id: "FeatureMatrix", description: "Feature comparison matrix across competing companies" }
);
export type FeatureMatrix = Static<typeof FeatureMatrixSchema>;

/** A demand signal from a specific platform */
export const DemandSignalSchema = Type.Object(
  {
    platform: Type.String(),
    sentiment: Type.String(),
    mentions: Type.Number(),
    sample_quotes: Type.Optional(Type.Array(Type.String())),
  },
  { $id: "DemandSignal", description: "A demand signal from a specific platform" }
);
export type DemandSignal = Static<typeof DemandSignalSchema>;

/** Hiring activity data for a company */
export const HiringDataSchema = Type.Object(
  {
    company: Type.String(),
    open_roles: Type.Number(),
    engineering_pct: Type.Optional(Type.Number()),
    trend: Type.String(),
  },
  { $id: "HiringData", description: "Hiring activity data for a company" }
);
export type HiringData = Static<typeof HiringDataSchema>;

// ---------------------------------------------------------------------------
// Agent Reports
// ---------------------------------------------------------------------------

/** Report returned by the incumbent-scanner agent */
export const IncumbentReportSchema = Type.Object(
  {
    companies_found: Type.Number(),
    new_entrants: Type.Number(),
    companies_updated: Type.Number(),
    market_classification: MarketClassification,
    feature_gaps: Type.Array(Type.String()),
    whitespace_opportunities: Type.Array(Type.String()),
    notable_changes: Type.Array(Type.String()),
    summary: Type.String(),
    feature_matrix: Type.Optional(FeatureMatrixSchema),
    market_leaders: Type.Optional(Type.Array(Type.String())),
    emerging_players: Type.Optional(Type.Array(Type.String())),
    technology_trends: Type.Optional(Type.Array(Type.String())),
    pricing_landscape: Type.Optional(
      Type.Object({
        range_low: Type.Number(),
        range_high: Type.Number(),
        model_types: Type.Array(Type.String()),
      })
    ),
  },
  { $id: "IncumbentReport", description: "Report from the incumbent-scanner agent" }
);
export type IncumbentReport = Static<typeof IncumbentReportSchema>;

/** Report returned by the funding-tracker agent */
export const FundingReportSchema = Type.Object(
  {
    events_found: Type.Number(),
    new_events: Type.Number(),
    total_funding_usd: Type.Number(),
    funding_trend: FundingTrend,
    funding_trend_previous: Type.Optional(FundingTrend),
    most_active_investors: Type.Array(Type.String()),
    space_maturity: SpaceMaturity,
    notable_changes: Type.Array(Type.String()),
    summary: Type.String(),
    investor_profiles: Type.Optional(
      Type.Array(
        Type.Object({
          name: Type.String(),
          type: Type.String(),
          thesis: Type.Optional(Type.String()),
          other_bets: Type.Optional(Type.Array(Type.String())),
        })
      )
    ),
    funding_velocity_quarterly: Type.Optional(
      Type.Array(
        Type.Object({
          quarter: Type.String(),
          amount: Type.Number(),
        })
      )
    ),
    concentration_index: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
    notable_investors: Type.Optional(Type.Array(Type.String())),
  },
  { $id: "FundingReport", description: "Report from the funding-tracker agent" }
);
export type FundingReport = Static<typeof FundingReportSchema>;

/** Report returned by the growth-estimator agent */
export const GrowthReportSchema = Type.Object(
  {
    signals_found: Type.Number(),
    new_signals: Type.Number(),
    tam_low_usd: Type.Optional(Type.Number()),
    tam_high_usd: Type.Optional(Type.Number()),
    cagr_estimate_pct: Type.Optional(Type.Number()),
    cagr_range: Type.Optional(Type.Array(Type.Number())),
    growth_trend: GrowthTrend,
    growth_trend_previous: Type.Optional(GrowthTrend),
    source_diversity: Type.Number(),
    notable_changes: Type.Array(Type.String()),
    methodology_notes: Type.String(),
    summary: Type.String(),
    demand_signals: Type.Optional(Type.Array(DemandSignalSchema)),
    hiring_velocity: Type.Optional(Type.Array(HiringDataSchema)),
    trend_trajectories: Type.Optional(
      Type.Array(
        Type.Object({
          type: Type.String(),
          direction: Type.String(),
          confidence: Type.Number(),
        })
      )
    ),
    market_narrative: Type.Optional(Type.String()),
  },
  { $id: "GrowthReport", description: "Report from the growth-estimator agent" }
);
export type GrowthReport = Static<typeof GrowthReportSchema>;

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------

/** Final verdict synthesized from all agent reports */
export const VerdictSchema = Type.Object(
  {
    recommendation: Recommendation,
    previous_recommendation: Type.Optional(Recommendation),
    recommendation_changed: Type.Boolean(),
    confidence: Type.Number({ minimum: 0, maximum: 100 }),
    summary: Type.String(),
    delta_narrative: Type.Optional(Type.String()),
    opportunity_score: Type.Number({ minimum: 0, maximum: 100 }),
    opportunity_factors: Type.Array(Type.String()),
    risk_score: Type.Number({ minimum: 0, maximum: 100 }),
    risk_factors: Type.Array(Type.String()),
    timing: Timing,
    competitive_density: CompetitiveDensity,
    funding_signal: FundingSignal,
    growth_signal: GrowthSignal,
    key_question: Type.String(),
    evidence_gaps: Type.Array(Type.String()),
    confidence_breakdown: Type.Optional(
      Type.Object({
        competition: Type.Number(),
        funding: Type.Number(),
        growth: Type.Number(),
        data_quality: Type.Number(),
      })
    ),
    comparable_spaces: Type.Optional(Type.Array(Type.String())),
    scenario_assessment: Type.Optional(
      Type.Object({
        bull_case: Type.String(),
        base_case: Type.String(),
        bear_case: Type.String(),
      })
    ),
    research_quality: Type.Optional(
      Type.Object({
        score: Type.Number(),
        gaps: Type.Array(Type.String()),
        stale_pct: Type.Number(),
      })
    ),
  },
  { $id: "Verdict", description: "Final verdict synthesized from all agent reports" }
);
export type Verdict = Static<typeof VerdictSchema>;

// ---------------------------------------------------------------------------
// Intelligence Signals
// ---------------------------------------------------------------------------

/** A discrete intelligence signal surfaced during analysis */
export const IntelSignalSchema = Type.Object(
  {
    signal_type: IntelSignalType,
    description: Type.String(),
    severity: Severity,
  },
  { $id: "IntelSignal", description: "A discrete intelligence signal surfaced during analysis" }
);
export type IntelSignal = Static<typeof IntelSignalSchema>;

// ---------------------------------------------------------------------------
// Job / Activity
// ---------------------------------------------------------------------------

/** A background job record for tracking scheduled and manual work */
export const JobRecordSchema = Type.Object(
  {
    job_type: JobType,
    target_type: TargetType,
    status: JobStatus,
    result_summary: Type.Optional(Type.String()),
    items_processed: Type.Optional(Type.Number()),
    items_found: Type.Optional(Type.Number()),
    items_new: Type.Optional(Type.Number()),
    error: Type.Optional(Type.String()),
    triggered_by: TriggeredBy,
  },
  { $id: "JobRecord", description: "A background job record for scheduled and manual work" }
);
export type JobRecord = Static<typeof JobRecordSchema>;

/** An activity log entry for the system timeline */
export const ActivityEntrySchema = Type.Object(
  {
    entity_type: EntityType,
    activity_type: ActivityType,
    description: Type.String(),
    source: ActivitySource,
  },
  { $id: "ActivityEntry", description: "An activity log entry for the system timeline" }
);
export type ActivityEntry = Static<typeof ActivityEntrySchema>;
