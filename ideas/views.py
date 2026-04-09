"""
Views for the ideas app.

ViewSet / view list:
  IdeaViewSet            - full CRUD + update_status + with_verdicts actions
  CompanyViewSet         - list/retrieve/create + upsert action
  FundingEventViewSet    - list/create
  MarketSignalViewSet    - list/create
  VerdictViewSet         - read-only list/retrieve + latest action
  IntelSignalViewSet     - list/create + recent action
  InvestorViewSet        - list/retrieve/create + upsert + portfolio actions
  ResearchView           - POST: trigger agent service research
  ResearchStreamView     - POST: SSE proxy to agent service
"""

import json
import logging

import requests
from django.conf import settings
from django.db import transaction
from django.http import StreamingHttpResponse
from django.views import View
from rest_framework import serializers as drf_serializers
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    Company,
    FundingEvent,
    Idea,
    IntelSignal,
    Investor,
    InvestorCompanyLink,
    MarketSignal,
    Verdict,
)
from .serializers import (
    AgentSkillSerializer,
    CompanySerializer,
    FundingEventSerializer,
    IdeaCreateSerializer,
    IdeaSerializer,
    IntelSignalSerializer,
    InvestorCompanyLinkSerializer,
    InvestorSerializer,
    MarketSignalSerializer,
    VerdictSerializer,
)
from .services import BrainService

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Idea
# ---------------------------------------------------------------------------


class IdeaViewSet(viewsets.ModelViewSet):
    """
    list: all ideas ordered by -created_at with latest_verdict attached
    retrieve: single idea
    create: status defaults to "active"
    update_status: PATCH action
    with_verdicts: idea + all verdicts ordered by -run__started_at
    """

    queryset = Idea.objects.all().order_by("-created_at")

    def get_serializer_class(self):
        if self.action == "create":
            return IdeaCreateSerializer
        return IdeaSerializer

    def list(self, request: Request, *args, **kwargs):
        """Attach latest verdict to each idea without N+1 queries."""
        ideas = list(self.get_queryset())

        # Bulk-fetch the latest verdict per idea using a subquery approach:
        # get all verdicts for these idea ids, group by idea, keep latest.
        idea_ids = [i.pk for i in ideas]
        verdicts_by_idea: dict[int, Verdict] = {}
        for v in (
            Verdict.objects.filter(idea_id__in=idea_ids)
            .select_related("run")
            .order_by("idea_id", "-run__started_at")
        ):
            if v.idea_id not in verdicts_by_idea:
                verdicts_by_idea[v.idea_id] = v

        for idea in ideas:
            idea._latest_verdict = verdicts_by_idea.get(idea.pk)

        serializer = IdeaSerializer(ideas, many=True, context={"request": request})
        return Response(serializer.data)

    def create(self, request: Request, *args, **kwargs):
        serializer = IdeaCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        idea = serializer.save(status="active")
        logger.info("idea created", extra={"idea_id": idea.pk})
        return Response(IdeaSerializer(idea).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["patch"], url_path="status")
    def update_status(self, request: Request, pk=None):
        """PATCH /ideas/{id}/status/ - valid values: active, watching, archived"""
        idea = self.get_object()
        new_status = request.data.get("status")
        if not new_status:
            return Response(
                {"detail": "status field is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        allowed = {"active", "watching", "archived"}
        if new_status not in allowed:
            return Response(
                {"detail": f"Invalid status. Must be one of: {', '.join(sorted(allowed))}."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        idea.status = new_status
        idea.save(update_fields=["status"])
        logger.info("idea status updated", extra={"idea_id": idea.pk, "status": new_status})
        return Response(IdeaSerializer(idea).data)

    @action(detail=True, methods=["get"], url_path="with-verdicts")
    def with_verdicts(self, request: Request, pk=None):
        """GET /ideas/{id}/with-verdicts/ - returns idea + all verdicts ordered by -run__started_at"""
        idea = self.get_object()
        verdicts = idea.verdicts.select_related("run").order_by("-run__started_at")
        data = IdeaSerializer(idea, context={"request": request}).data
        data["verdicts"] = VerdictSerializer(verdicts, many=True).data
        return Response(data)


# ---------------------------------------------------------------------------
# Company
# ---------------------------------------------------------------------------


class CompanyViewSet(viewsets.ModelViewSet):
    """
    list: filter by idea_id query param
    upsert: POST action - match on name+idea, update or create
    """

    serializer_class = CompanySerializer
    # Allow create via the standard endpoint; upsert is a separate action.
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        qs = Company.objects.all()
        idea_id = self.request.query_params.get("idea_id")
        if idea_id:
            qs = qs.filter(idea_id=idea_id)
        return qs.order_by("-last_seen")

    @action(detail=False, methods=["post"], url_path="upsert")
    def upsert(self, request: Request):
        """POST /companies/upsert/ - match on name+idea, update or create."""
        idea_id = request.data.get("idea_id") or request.query_params.get("idea_id")
        if not idea_id:
            return Response(
                {"detail": "idea_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            idea_id = int(idea_id)
        except (TypeError, ValueError):
            return Response({"detail": "idea_id must be an integer."}, status=status.HTTP_400_BAD_REQUEST)

        if "name" not in request.data:
            return Response({"detail": "name is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            company = BrainService.upsert_company(idea_id, request.data)
        except Exception as exc:
            logger.error(
                "upsert_company failed",
                exc_info=True,
                extra={"idea_id": idea_id, "name": request.data.get("name")},
            )
            return Response({"detail": str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response(CompanySerializer(company).data, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# FundingEvent
# ---------------------------------------------------------------------------


class FundingEventViewSet(viewsets.ModelViewSet):
    serializer_class = FundingEventSerializer
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        qs = FundingEvent.objects.all()
        idea_id = self.request.query_params.get("idea_id")
        if idea_id:
            qs = qs.filter(idea_id=idea_id)
        return qs.order_by("-date")

    def create(self, request: Request, *args, **kwargs):
        """Create with dedup on company_name + round + date + idea."""
        idea_id = request.data.get("idea_id")
        if not idea_id:
            return Response({"detail": "idea_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            idea_id = int(idea_id)
        except (TypeError, ValueError):
            return Response({"detail": "idea_id must be an integer."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            event = BrainService.insert_funding(idea_id, request.data)
        except Exception as exc:
            logger.error("insert_funding failed", exc_info=True, extra={"idea_id": idea_id})
            return Response({"detail": str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        if event is None:
            return Response(
                {"detail": "Duplicate funding event detected. Skipped."},
                status=status.HTTP_200_OK,
            )

        return Response(FundingEventSerializer(event).data, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# MarketSignal
# ---------------------------------------------------------------------------


class MarketSignalViewSet(viewsets.ModelViewSet):
    serializer_class = MarketSignalSerializer
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        qs = MarketSignal.objects.all()
        idea_id = self.request.query_params.get("idea_id")
        if idea_id:
            qs = qs.filter(idea_id=idea_id)
        return qs.order_by("-captured_at")


# ---------------------------------------------------------------------------
# Verdict
# ---------------------------------------------------------------------------


class VerdictViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = VerdictSerializer

    def get_queryset(self):
        qs = Verdict.objects.select_related("run").all()
        idea_id = self.request.query_params.get("idea_id")
        if idea_id:
            qs = qs.filter(idea_id=idea_id)
        return qs.order_by("-id")

    @action(detail=False, methods=["get"], url_path="latest")
    def latest(self, request: Request):
        """GET /verdicts/latest/?idea_id=X - most recent verdict for the idea."""
        idea_id = request.query_params.get("idea_id")
        if not idea_id:
            return Response({"detail": "idea_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        verdict = (
            Verdict.objects.filter(idea_id=idea_id)
            .select_related("run")
            .order_by("-run__started_at")
            .first()
        )
        if verdict is None:
            return Response({"detail": "No verdict found."}, status=status.HTTP_404_NOT_FOUND)

        return Response(VerdictSerializer(verdict).data)


# ---------------------------------------------------------------------------
# IntelSignal
# ---------------------------------------------------------------------------


class IntelSignalViewSet(viewsets.ModelViewSet):
    serializer_class = IntelSignalSerializer
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        qs = IntelSignal.objects.all()
        idea_id = self.request.query_params.get("idea_id")
        severity = self.request.query_params.get("severity")
        if idea_id:
            qs = qs.filter(idea_id=idea_id)
        if severity:
            qs = qs.filter(severity=severity)
        return qs.order_by("-detected_at")

    @action(detail=False, methods=["get"], url_path="recent")
    def recent(self, request: Request):
        """GET /intel-signals/recent/ - last 100 across all ideas."""
        signals = IntelSignal.objects.order_by("-detected_at")[:100]
        return Response(IntelSignalSerializer(signals, many=True).data)


# ---------------------------------------------------------------------------
# Investor
# ---------------------------------------------------------------------------


class InvestorViewSet(viewsets.ModelViewSet):
    serializer_class = InvestorSerializer
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        return Investor.objects.all().order_by("name")

    @action(detail=False, methods=["post"], url_path="upsert")
    def upsert(self, request: Request):
        """POST /investors/upsert/ - match on name, update or create."""
        name = request.data.get("name")
        if not name:
            return Response({"detail": "name is required."}, status=status.HTTP_400_BAD_REQUEST)

        now = __import__("django.utils.timezone", fromlist=["now"]).now()

        try:
            with transaction.atomic():
                investor, created = Investor.objects.get_or_create(
                    name=name,
                    defaults={
                        "type": request.data.get("type", "unknown"),
                        "thesis": request.data.get("thesis"),
                        "check_size_min": request.data.get("check_size_min"),
                        "check_size_max": request.data.get("check_size_max"),
                        "focus_areas": request.data.get("focus_areas", []),
                        "portfolio_count": request.data.get("portfolio_count"),
                        "notable_portfolio": request.data.get("notable_portfolio", []),
                        "source_urls": request.data.get("source_urls", []),
                        "data_confidence": request.data.get("data_confidence", "medium"),
                        "first_seen": now,
                        "last_seen": now,
                    },
                )
                if not created:
                    for field in (
                        "type",
                        "thesis",
                        "check_size_min",
                        "check_size_max",
                        "portfolio_count",
                    ):
                        val = request.data.get(field)
                        if val is not None:
                            setattr(investor, field, val)
                    for field in ("focus_areas", "notable_portfolio", "source_urls"):
                        if field in request.data:
                            setattr(investor, field, request.data[field])
                    if "data_confidence" in request.data:
                        investor.data_confidence = request.data["data_confidence"]
                    investor.last_seen = now
                    investor.save()
        except Exception as exc:
            logger.error("investor upsert failed", exc_info=True, extra={"name": name})
            return Response({"detail": str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response(InvestorSerializer(investor).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"], url_path="portfolio")
    def portfolio(self, request: Request, pk=None):
        """GET /investors/{id}/portfolio/ - all InvestorCompanyLink entries for this investor."""
        investor = self.get_object()
        links = InvestorCompanyLink.objects.filter(investor=investor).select_related("company", "idea")
        return Response(InvestorCompanyLinkSerializer(links, many=True).data)


# ---------------------------------------------------------------------------
# Research trigger
# ---------------------------------------------------------------------------


class ResearchView(APIView):
    """
    POST /research/
    Body: { description: str, idea_id?: int, tags?: list }

    Creates an Idea if needed (dedup by description), then POSTs to the agent
    service and returns { idea_id, status }.
    """

    def post(self, request: Request):
        description = (request.data.get("description") or "").strip()
        if not description:
            return Response(
                {"detail": "description is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Dedup by description; create if absent.
        idea_id = request.data.get("idea_id")
        if idea_id:
            try:
                idea = Idea.objects.get(pk=idea_id)
            except Idea.DoesNotExist:
                return Response(
                    {"detail": f"Idea {idea_id} not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )
        else:
            idea, created = Idea.objects.get_or_create(
                description=description,
                defaults={"status": "active"},
            )
            if created:
                logger.info("research: created new idea", extra={"idea_id": idea.pk})

        agent_url = getattr(settings, "AGENT_SERVICE_URL", "http://localhost:4000")
        payload = {
            "idea_id": idea.pk,
            "description": idea.description,
            "tags": request.data.get("tags", idea.tags or []),
        }

        logger.info(
            "research: calling agent service",
            extra={"idea_id": idea.pk, "agent_url": agent_url},
        )

        try:
            resp = requests.post(
                f"{agent_url}/research",
                json=payload,
                timeout=30,
            )
            resp.raise_for_status()
            agent_data = resp.json()
        except requests.Timeout:
            logger.error("research: agent service timed out", extra={"idea_id": idea.pk})
            return Response(
                {"detail": "Agent service timed out."},
                status=status.HTTP_504_GATEWAY_TIMEOUT,
            )
        except requests.RequestException as exc:
            logger.error(
                "research: agent service error",
                exc_info=True,
                extra={"idea_id": idea.pk, "error": str(exc)},
            )
            return Response(
                {"detail": f"Agent service error: {exc}"},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response(
            {
                "idea_id": idea.pk,
                "status": agent_data.get("status", "started"),
                "agent_response": agent_data,
            },
            status=status.HTTP_202_ACCEPTED,
        )


# ---------------------------------------------------------------------------
# Research SSE stream proxy
# ---------------------------------------------------------------------------


class ResearchStreamView(View):
    """
    POST /research/stream/
    Body: { idea_id: int, description?: str }

    Proxies the SSE stream from the agent service to the browser using
    Django's StreamingHttpResponse. Uses requests with stream=True to avoid
    buffering the entire response.
    """

    def post(self, request):
        try:
            body = json.loads(request.body or "{}")
        except json.JSONDecodeError:
            return StreamingHttpResponse(
                iter([b"data: {\"error\": \"Invalid JSON body\"}\n\n"]),
                content_type="text/event-stream",
                status=400,
            )

        idea_id = body.get("idea_id")
        if not idea_id:
            return StreamingHttpResponse(
                iter([b"data: {\"error\": \"idea_id is required\"}\n\n"]),
                content_type="text/event-stream",
                status=400,
            )

        agent_url = getattr(settings, "AGENT_SERVICE_URL", "http://localhost:4000")
        payload = {
            "idea_id": idea_id,
            "description": body.get("description", ""),
        }

        logger.info(
            "research_stream: opening SSE proxy",
            extra={"idea_id": idea_id, "agent_url": agent_url},
        )

        def event_stream():
            try:
                with requests.post(
                    f"{agent_url}/research/stream",
                    json=payload,
                    stream=True,
                    timeout=(10, None),  # connect timeout 10s, read timeout infinite
                ) as resp:
                    resp.raise_for_status()
                    for chunk in resp.iter_content(chunk_size=None):
                        if chunk:
                            yield chunk
            except requests.Timeout:
                logger.error(
                    "research_stream: agent service connect timeout",
                    extra={"idea_id": idea_id},
                )
                yield b"data: {\"error\": \"Agent service connection timed out\"}\n\n"
            except requests.RequestException as exc:
                logger.error(
                    "research_stream: agent service error",
                    exc_info=True,
                    extra={"idea_id": idea_id, "error": str(exc)},
                )
                yield f"data: {{\"error\": \"{exc}\"}}\n\n".encode()

        response = StreamingHttpResponse(event_stream(), content_type="text/event-stream")
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"  # disable nginx buffering
        return response
