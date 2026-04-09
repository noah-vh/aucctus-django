from django.contrib import admin

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


@admin.register(Idea)
class IdeaAdmin(admin.ModelAdmin):
    list_display = ["id", "description_short", "status", "current_verdict", "created_at"]
    list_filter = ["status", "current_verdict"]
    search_fields = ["description"]
    ordering = ["-created_at"]

    def description_short(self, obj):
        return obj.description[:60]
    description_short.short_description = "Description"


@admin.register(Company)
class CompanyAdmin(admin.ModelAdmin):
    list_display = ["name", "idea", "data_confidence", "employee_estimate", "last_seen"]
    list_filter = ["data_confidence"]
    search_fields = ["name", "description"]
    raw_id_fields = ["idea"]


@admin.register(FundingEvent)
class FundingEventAdmin(admin.ModelAdmin):
    list_display = ["company_name", "round", "amount_usd", "date", "data_confidence"]
    list_filter = ["round", "data_confidence"]
    search_fields = ["company_name", "lead_investor"]
    raw_id_fields = ["idea", "company"]


@admin.register(MarketSignal)
class MarketSignalAdmin(admin.ModelAdmin):
    list_display = ["signal_type", "value", "unit", "source_credibility", "captured_at"]
    list_filter = ["signal_type", "source_credibility"]
    search_fields = ["value", "source_url"]
    raw_id_fields = ["idea"]


@admin.register(ResearchRun)
class ResearchRunAdmin(admin.ModelAdmin):
    list_display = ["id", "idea", "status", "triggered_by", "started_at", "completed_at"]
    list_filter = ["status", "triggered_by"]
    raw_id_fields = ["idea"]


@admin.register(Verdict)
class VerdictAdmin(admin.ModelAdmin):
    list_display = ["id", "idea", "recommendation", "confidence", "opportunity_score", "risk_score"]
    list_filter = ["recommendation", "timing", "competitive_density", "funding_signal", "growth_signal"]
    raw_id_fields = ["run", "idea"]


@admin.register(IntelSignal)
class IntelSignalAdmin(admin.ModelAdmin):
    list_display = ["signal_type", "severity", "idea", "detected_at"]
    list_filter = ["signal_type", "severity"]
    search_fields = ["description"]
    raw_id_fields = ["idea", "run"]


@admin.register(Investor)
class InvestorAdmin(admin.ModelAdmin):
    list_display = ["name", "type", "data_confidence", "portfolio_count", "last_seen"]
    list_filter = ["type", "data_confidence"]
    search_fields = ["name", "thesis"]


@admin.register(InvestorCompanyLink)
class InvestorCompanyLinkAdmin(admin.ModelAdmin):
    list_display = ["investor", "company", "idea", "round", "role"]
    list_filter = ["role"]
    raw_id_fields = ["investor", "company", "idea"]


@admin.register(CompanyMetric)
class CompanyMetricAdmin(admin.ModelAdmin):
    list_display = ["company", "metric_type", "value", "unit", "date", "captured_at"]
    list_filter = ["metric_type"]
    raw_id_fields = ["company", "idea"]


@admin.register(FeatureComparison)
class FeatureComparisonAdmin(admin.ModelAdmin):
    list_display = ["id", "idea", "created_at"]
    raw_id_fields = ["idea"]


@admin.register(MarketTrend)
class MarketTrendAdmin(admin.ModelAdmin):
    list_display = ["trend_type", "direction", "confidence", "data_points", "idea", "computed_at"]
    list_filter = ["trend_type", "direction"]
    raw_id_fields = ["idea"]


@admin.register(ResearchQuality)
class ResearchQualityAdmin(admin.ModelAdmin):
    list_display = ["idea", "overall_score", "coverage_score", "stale_items", "computed_at"]
    raw_id_fields = ["run", "idea"]


@admin.register(AgentSkill)
class AgentSkillAdmin(admin.ModelAdmin):
    list_display = ["agent_name", "skill_name", "status", "use_count", "last_used"]
    list_filter = ["agent_name", "status"]
    search_fields = ["agent_name", "skill_name", "description"]
