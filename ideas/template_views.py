"""Template views for Django frontend pages."""
import logging

from django.shortcuts import render, get_object_or_404

from .models import (
    Idea, Company, FundingEvent, MarketSignal, Verdict, IntelSignal,
    Investor, MarketTrend, ResearchRun,
)
from chat.models import ChatSession
from monitoring.models import Job

logger = logging.getLogger(__name__)


def dashboard(request):
    """Dashboard page - market intelligence overview."""
    ideas = Idea.objects.all()[:10]
    signals = IntelSignal.objects.select_related("idea").order_by("-detected_at")[:20]
    active_jobs = Job.objects.filter(status="running")

    logger.info("dashboard_view: ideas=%d signals=%d active_jobs=%d",
                ideas.count(), signals.count(), active_jobs.count())

    return render(request, "dashboard.html", {
        "ideas": ideas,
        "signals": signals,
        "active_jobs": active_jobs,
    })


def chat(request):
    """Chat page with session sidebar."""
    sessions = ChatSession.objects.filter(status="active").order_by("-updated_at")[:50]
    active_session_id = request.GET.get("session")
    active_session = None
    messages = []

    if active_session_id:
        try:
            active_session = ChatSession.objects.get(pk=active_session_id)
            messages = active_session.messages.all()
        except ChatSession.DoesNotExist:
            logger.warning("chat_view: session_id=%s not found", active_session_id)
    elif sessions.exists():
        active_session = sessions[0]
        messages = active_session.messages.all()

    return render(request, "chat.html", {
        "sessions": sessions,
        "active_session": active_session,
        "messages": messages,
    })


def ideas_list(request):
    """Ideas list page with latest verdict attached."""
    ideas = Idea.objects.prefetch_related("verdicts").all()
    # Attach latest verdict to each idea for template use
    for idea in ideas:
        verdicts = idea.verdicts.all()
        idea.latest_verdict = verdicts[0] if verdicts else None

    return render(request, "ideas/list.html", {
        "ideas": ideas,
    })


def idea_detail(request, pk):
    """Idea detail page with all related data."""
    idea = get_object_or_404(Idea, pk=pk)
    companies = Company.objects.filter(idea=idea).order_by("-last_seen")
    funding = FundingEvent.objects.filter(idea=idea).order_by("-date")
    signals = MarketSignal.objects.filter(idea=idea).order_by("-captured_at")
    intel = IntelSignal.objects.filter(idea=idea).order_by("-detected_at")
    verdicts = Verdict.objects.filter(idea=idea).select_related("run").order_by("-id")
    runs = ResearchRun.objects.filter(idea=idea).order_by("-started_at")
    latest_verdict = verdicts[0] if verdicts else None

    logger.info("idea_detail: pk=%d companies=%d funding=%d",
                pk, companies.count(), funding.count())

    return render(request, "ideas/detail.html", {
        "idea": idea,
        "companies": companies,
        "funding": funding,
        "signals": signals,
        "intel_signals": intel,
        "verdicts": verdicts,
        "runs": runs,
        "latest_verdict": latest_verdict,
    })


def company_detail(request, pk):
    """Company detail page."""
    company = get_object_or_404(Company, pk=pk)
    funding = FundingEvent.objects.filter(
        company_name=company.name, idea=company.idea
    ).order_by("-date")
    return render(request, "companies/detail.html", {
        "company": company,
        "funding": funding,
    })


def investor_detail(request, pk):
    """Investor detail page."""
    investor = get_object_or_404(Investor, pk=pk)
    return render(request, "investors/detail.html", {
        "investor": investor,
    })


def compare(request):
    """Compare page - side-by-side company comparison."""
    ideas = Idea.objects.all()
    selected_idea_id = request.GET.get("idea")
    selected_idea = None
    companies = []

    comparison_rows = [
        {"key": "description", "label": "Description"},
        {"key": "features", "label": "Features"},
        {"key": "pricing_model", "label": "Pricing"},
        {"key": "target_segment", "label": "Target Segment"},
        {"key": "differentiator", "label": "Differentiator"},
        {"key": "weakness", "label": "Weakness"},
        {"key": "employee_estimate", "label": "Employees"},
        {"key": "founded_year", "label": "Founded"},
        {"key": "headquarters", "label": "HQ"},
        {"key": "data_confidence", "label": "Data Confidence"},
    ]

    if selected_idea_id:
        try:
            selected_idea = Idea.objects.get(pk=selected_idea_id)
            companies = selected_idea.companies.all()[:8]
        except Idea.DoesNotExist:
            logger.warning("compare_view: idea_id=%s not found", selected_idea_id)

    return render(request, "compare.html", {
        "ideas": ideas,
        "selected_idea": selected_idea,
        "companies": companies,
        "comparison_rows": comparison_rows,
    })


def trends(request):
    """Trends page - market trends per idea."""
    ideas = Idea.objects.prefetch_related("market_trends").all()
    return render(request, "trends.html", {
        "ideas": ideas,
    })


def monitoring_page(request):
    """Monitoring page - jobs and scheduled intelligence."""
    active_jobs = Job.objects.filter(status__in=["running", "pending"])
    recent_jobs = Job.objects.order_by("-started_at")[:15]

    return render(request, "monitoring.html", {
        "active_jobs": active_jobs,
        "recent_jobs": recent_jobs,
    })


def agents(request):
    """Agents page - research agent system overview."""
    agents_data = [
        {
            "name": "Orchestrator",
            "role": "Strategic Advisor",
            "icon": "orchestrator",
            "description": "Coordinates research across all specialists. Reads their findings, compares against historical data, and produces the final verdict with confidence scoring and evidence gaps.",
            "tools": ["research_incumbents", "research_funding", "research_growth", "query_brain"],
        },
        {
            "name": "Incumbents",
            "role": "Competitive Intelligence",
            "icon": "incumbents",
            "description": "Finds and characterizes companies in the product space. Extracts features, pricing models, and market positioning. Identifies gaps and whitespace opportunities.",
            "tools": ["exa_search", "tavily_search", "web_fetch", "upsert_company", "query_brain"],
        },
        {
            "name": "Funding",
            "role": "Capital Markets Analyst",
            "icon": "funding",
            "description": "Tracks funding events, investor patterns, and capital flow trends. Classifies space maturity and signals based on investment patterns.",
            "tools": ["exa_search", "tavily_search", "web_fetch", "insert_funding", "query_brain"],
        },
        {
            "name": "Growth",
            "role": "Market Analyst",
            "icon": "growth",
            "description": "Triangulates market size and growth trajectory from TAM reports, hiring trends, search interest, and organic demand signals. Always reports ranges, never false precision.",
            "tools": ["tavily_search", "exa_search", "web_fetch", "insert_signal", "query_brain"],
        },
    ]

    return render(request, "agents.html", {
        "agents_data": agents_data,
    })
