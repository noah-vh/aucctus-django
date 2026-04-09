from rest_framework import serializers

from .models import (
    AgentSkill,
    Company,
    CompanyMetric,
    FeatureComparison,
    FundingEvent,
    Idea,
    IntelSignal,
    Investor,
    InvestorCompanyLink,
    MarketSignal,
    MarketTrend,
    ResearchQuality,
    ResearchRun,
    Verdict,
)


class IdeaSerializer(serializers.ModelSerializer):
    # Populated by the list view via annotation or prefetch; read-only.
    latest_verdict = serializers.SerializerMethodField()

    class Meta:
        model = Idea
        fields = [
            "id",
            "description",
            "status",
            "current_verdict",
            "tags",
            "related_ideas",
            "research_quality_score",
            "score_history",
            "created_at",
            "last_researched_at",
            "latest_verdict",
        ]
        read_only_fields = ["id", "created_at", "latest_verdict"]

    def get_latest_verdict(self, obj):
        # The view annotates `_latest_verdict` to avoid N+1. Fall back gracefully.
        verdict = getattr(obj, "_latest_verdict", None)
        if verdict is None:
            return None
        return VerdictSerializer(verdict).data


class IdeaCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Idea
        fields = ["description", "tags"]

    def create(self, validated_data):
        validated_data.setdefault("status", "active")
        return super().create(validated_data)


class CompanySerializer(serializers.ModelSerializer):
    class Meta:
        model = Company
        fields = [
            "id",
            "idea",
            "name",
            "url",
            "description",
            "product_names",
            "features",
            "pricing_model",
            "target_segment",
            "differentiator",
            "weakness",
            "employee_estimate",
            "founded_year",
            "headquarters",
            "data_confidence",
            "source_urls",
            "technology_stack",
            "integrations",
            "customer_segments",
            "key_people",
            "change_history",
            "total_funding_raised",
            "first_seen",
            "last_seen",
        ]
        read_only_fields = ["id", "first_seen", "last_seen"]


class FundingEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = FundingEvent
        fields = [
            "id",
            "idea",
            "company",
            "company_name",
            "round",
            "amount_usd",
            "date",
            "lead_investor",
            "co_investors",
            "source_url",
            "data_confidence",
            "valuation_estimate",
            "use_of_funds",
            "first_seen",
        ]
        read_only_fields = ["id", "first_seen"]


class MarketSignalSerializer(serializers.ModelSerializer):
    class Meta:
        model = MarketSignal
        fields = [
            "id",
            "idea",
            "signal_type",
            "value",
            "unit",
            "source_url",
            "source_credibility",
            "date",
            "captured_at",
        ]
        read_only_fields = ["id", "captured_at"]


class ResearchRunSerializer(serializers.ModelSerializer):
    class Meta:
        model = ResearchRun
        fields = [
            "id",
            "idea",
            "status",
            "triggered_by",
            "started_at",
            "completed_at",
            "agents_completed",
            "token_usage",
            "cost_estimate",
        ]
        read_only_fields = ["id"]


class VerdictSerializer(serializers.ModelSerializer):
    class Meta:
        model = Verdict
        fields = [
            "id",
            "run",
            "idea",
            "recommendation",
            "previous_recommendation",
            "recommendation_changed",
            "confidence",
            "summary",
            "delta_narrative",
            "opportunity_score",
            "opportunity_factors",
            "risk_score",
            "risk_factors",
            "timing",
            "competitive_density",
            "funding_signal",
            "growth_signal",
            "key_question",
            "evidence_gaps",
        ]
        read_only_fields = ["id"]


class IntelSignalSerializer(serializers.ModelSerializer):
    class Meta:
        model = IntelSignal
        fields = [
            "id",
            "idea",
            "run",
            "signal_type",
            "description",
            "severity",
            "detected_at",
        ]
        read_only_fields = ["id"]


class InvestorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Investor
        fields = [
            "id",
            "name",
            "type",
            "thesis",
            "check_size_min",
            "check_size_max",
            "focus_areas",
            "portfolio_count",
            "notable_portfolio",
            "source_urls",
            "data_confidence",
            "first_seen",
            "last_seen",
        ]
        read_only_fields = ["id", "first_seen", "last_seen"]


class InvestorCompanyLinkSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvestorCompanyLink
        fields = [
            "id",
            "investor",
            "company",
            "idea",
            "round",
            "role",
            "amount_contributed",
        ]
        read_only_fields = ["id"]


class CompanyMetricSerializer(serializers.ModelSerializer):
    class Meta:
        model = CompanyMetric
        fields = [
            "id",
            "company",
            "idea",
            "metric_type",
            "value",
            "unit",
            "date",
            "source_url",
            "captured_at",
        ]
        read_only_fields = ["id", "captured_at"]


class FeatureComparisonSerializer(serializers.ModelSerializer):
    class Meta:
        model = FeatureComparison
        fields = [
            "id",
            "idea",
            "features",
            "companies_compared",
            "shared_features",
            "gap_features",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class MarketTrendSerializer(serializers.ModelSerializer):
    class Meta:
        model = MarketTrend
        fields = [
            "id",
            "idea",
            "trend_type",
            "direction",
            "data_points",
            "confidence",
            "period",
            "description",
            "computed_at",
        ]
        read_only_fields = ["id"]


class ResearchQualitySerializer(serializers.ModelSerializer):
    class Meta:
        model = ResearchQuality
        fields = [
            "id",
            "run",
            "idea",
            "overall_score",
            "coverage_score",
            "recency_score",
            "diversity_score",
            "confidence_score",
            "gaps",
            "recommendations",
            "stale_items",
            "computed_at",
        ]
        read_only_fields = ["id"]


class AgentSkillSerializer(serializers.ModelSerializer):
    class Meta:
        model = AgentSkill
        fields = [
            "id",
            "agent_name",
            "skill_name",
            "description",
            "created_at",
            "last_used",
            "use_count",
            "status",
        ]
        read_only_fields = ["id", "created_at"]
