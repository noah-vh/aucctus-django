"""
Views for the chat app.

ViewSets:
  ChatSessionViewSet  - list active sessions, create, destroy, archive action
  ChatMessageViewSet  - list by session, create (bumps session updated_at), partial_update

Views:
  ChatResearchStreamView - POST: create/get session, save user message, proxy SSE from
                           agent service, persist assistant messages as events arrive
"""

import json
import logging

import requests
from django.conf import settings
from django.http import StreamingHttpResponse
from django.utils import timezone
from django.views import View
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.request import Request
from rest_framework.response import Response

from ideas.models import Idea, ResearchRun, Verdict

from .models import ChatMessage, ChatSession
from .serializers import (
    ChatMessageCreateSerializer,
    ChatMessageSerializer,
    ChatMessageUpdateSerializer,
    ChatSessionCreateSerializer,
    ChatSessionSerializer,
)

logger = logging.getLogger(__name__)


class ChatSessionViewSet(viewsets.ModelViewSet):
    """
    list    - active sessions ordered by -updated_at (max 50, matching Convex listSessions)
    create  - new session with title; status defaults to "active"
    destroy - deletes session and all messages
    archive - PATCH action sets status to "archived"
    """

    def get_queryset(self):
        if self.action == "list":
            return ChatSession.objects.filter(status="active").order_by("-updated_at")[:50]
        return ChatSession.objects.all().order_by("-updated_at")

    def get_serializer_class(self):
        if self.action == "create":
            return ChatSessionCreateSerializer
        return ChatSessionSerializer

    def create(self, request: Request, *args, **kwargs):
        serializer = ChatSessionCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        session = serializer.save(status="active")
        logger.info("chat_session created", extra={"session_id": session.pk})
        return Response(ChatSessionSerializer(session).data, status=status.HTTP_201_CREATED)

    def destroy(self, request: Request, *args, **kwargs):
        """Delete session and all its messages (mirrors Convex deleteSession)."""
        session = self.get_object()
        session_id = session.pk
        count = session.messages.count()
        session.messages.all().delete()
        session.delete()
        logger.info(
            "chat_session deleted",
            extra={"session_id": session_id, "messages_deleted": count},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["patch"], url_path="archive")
    def archive(self, request: Request, pk=None):
        """PATCH /chat/sessions/{id}/archive/ - set status to archived."""
        session = self.get_object()
        session.status = "archived"
        session.save(update_fields=["status"])
        logger.info("chat_session archived", extra={"session_id": session.pk})
        return Response(ChatSessionSerializer(session).data)


class ChatMessageViewSet(viewsets.ModelViewSet):
    """
    list          - filter by session_id, ordered by timestamp asc
    create        - add message, bump session.updated_at
    partial_update- update content / agent_events / idea_id
    """

    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        qs = ChatMessage.objects.all()
        session_id = self.request.query_params.get("session_id")
        if session_id:
            qs = qs.filter(session_id=session_id)
        return qs.order_by("timestamp")

    def get_serializer_class(self):
        if self.action == "create":
            return ChatMessageCreateSerializer
        if self.action == "partial_update":
            return ChatMessageUpdateSerializer
        return ChatMessageSerializer

    def create(self, request: Request, *args, **kwargs):
        """Add a message and bump session.updated_at (mirrors Convex addMessage)."""
        serializer = ChatMessageCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)

        # Set timestamp if not provided
        data = dict(serializer.validated_data)
        if not data.get("timestamp"):
            data["timestamp"] = timezone.now()

        session = data["session"]
        message = ChatMessage.objects.create(**data)

        # Bump session updated_at - auto_now handles this on save() only when a field changes.
        # Force it by explicitly saving with update_fields.
        ChatSession.objects.filter(pk=session.pk).update(updated_at=timezone.now())

        logger.info(
            "chat_message created",
            extra={"message_id": message.pk, "session_id": session.pk, "role": message.role},
        )
        return Response(ChatMessageSerializer(message).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request: Request, *args, **kwargs):
        """PATCH /chat/messages/{id}/ - update content, agent_events, or idea_id."""
        message = self.get_object()
        serializer = ChatMessageUpdateSerializer(message, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        logger.info(
            "chat_message updated",
            extra={"message_id": message.pk, "fields": list(request.data.keys())},
        )
        return Response(ChatMessageSerializer(message).data)


def _persist_verdict(idea_id: int, data: dict | None) -> None:
    """Create a ResearchRun + Verdict from the orchestrator's verdict payload and
    update the parent Idea's current_verdict / last_researched_at fields."""
    if not data or not isinstance(data, dict):
        return

    now = timezone.now()
    run = ResearchRun.objects.create(
        idea_id=idea_id,
        status="completed",
        triggered_by="user",
        started_at=now,
        completed_at=now,
    )
    Verdict.objects.create(
        run=run,
        idea_id=idea_id,
        recommendation=data.get("recommendation", "watch"),
        previous_recommendation=data.get("previous_recommendation"),
        recommendation_changed=bool(data.get("recommendation_changed", False)),
        confidence=float(data.get("confidence", 0) or 0),
        summary=data.get("summary") or "",
        delta_narrative=data.get("delta_narrative"),
        opportunity_score=float(data.get("opportunity_score", 0) or 0),
        opportunity_factors=data.get("opportunity_factors") or [],
        risk_score=float(data.get("risk_score", 0) or 0),
        risk_factors=data.get("risk_factors") or [],
        timing=data.get("timing") or "unknown",
        competitive_density=data.get("competitive_density") or "unknown",
        funding_signal=data.get("funding_signal") or "unknown",
        growth_signal=data.get("growth_signal") or "unknown",
        key_question=data.get("key_question") or "",
        evidence_gaps=data.get("evidence_gaps") or [],
    )
    Idea.objects.filter(pk=idea_id).update(
        current_verdict=data.get("recommendation"),
        last_researched_at=now,
    )
    logger.info(
        "verdict persisted",
        extra={"idea_id": idea_id, "recommendation": data.get("recommendation")},
    )


# ---------------------------------------------------------------------------
# Research streaming proxy (what the chat page actually POSTs to)
# ---------------------------------------------------------------------------


class ChatResearchStreamView(View):
    """
    POST /api/v1/chat/research-stream/
    Body: { description: str, session_id?: int|"" }

    Creates or reuses a ChatSession, persists the user message, gets or creates
    the underlying Idea, then opens an SSE stream to the agent service and
    forwards events to the browser while also persisting assistant messages
    per agent as their completions arrive.
    """

    # CSRF is enforced by Django's default; the chat page already sends the token.

    def post(self, request):
        try:
            body = json.loads(request.body or "{}")
        except json.JSONDecodeError:
            return StreamingHttpResponse(
                iter([b'data: {"type":"error","message":"Invalid JSON body"}\n\n']),
                content_type="text/event-stream",
                status=400,
            )

        description = (body.get("description") or "").strip()
        if not description:
            return StreamingHttpResponse(
                iter([b'data: {"type":"error","message":"description is required"}\n\n']),
                content_type="text/event-stream",
                status=400,
            )

        # Session: reuse if id provided, otherwise create a new one titled from the prompt.
        raw_session_id = body.get("session_id")
        session = None
        if raw_session_id not in (None, "", 0, "0"):
            try:
                session = ChatSession.objects.get(pk=int(raw_session_id))
            except (ChatSession.DoesNotExist, TypeError, ValueError):
                session = None
        if session is None:
            session = ChatSession.objects.create(
                title=description[:200] or "New Research",
                status="active",
            )
            logger.info("chat: created session", extra={"session_id": session.pk})

        # Dedup idea by description so repeated chats update the same idea record.
        idea, idea_created = Idea.objects.get_or_create(
            description=description,
            defaults={"status": "active"},
        )
        if idea_created:
            logger.info("chat: created idea", extra={"idea_id": idea.pk})

        # Link session to idea if not already linked.
        if session.idea_id is None:
            session.idea = idea
            session.save(update_fields=["idea"])

        # Persist the user message now.
        now = timezone.now()
        ChatMessage.objects.create(
            session=session,
            role="user",
            content=description,
            timestamp=now,
        )
        ChatSession.objects.filter(pk=session.pk).update(updated_at=now)

        agent_url = getattr(settings, "AGENT_SERVICE_URL", "http://localhost:4000")
        payload = {"idea_id": idea.pk, "description": description}

        logger.info(
            "chat_research_stream: opening SSE proxy",
            extra={
                "session_id": session.pk,
                "idea_id": idea.pk,
                "agent_url": agent_url,
            },
        )

        session_id_local = session.pk
        idea_id_local = idea.pk

        def event_stream():
            # Send a handshake event up-front so the browser knows which session to
            # redirect to once the run is finished.
            handshake = {
                "type": "session",
                "session_id": session_id_local,
                "idea_id": idea_id_local,
            }
            yield f"data: {json.dumps(handshake)}\n\n".encode()

            # Buffer of streaming events grouped by agent so we can persist one
            # ChatMessage per agent when the agent emits `agent_end`.
            agent_buffers: dict[str, list[dict]] = {}
            final_verdict: dict | None = None

            def persist_agent(agent_name: str, events: list[dict], idea_id_val: int):
                # Find the last "text" content from the agent's events to use as the
                # message body. Fall back to agent_end.message if no text was emitted.
                text = ""
                for ev in events:
                    if ev.get("type") == "text" and ev.get("content"):
                        text = ev["content"]
                for ev in events:
                    if ev.get("type") == "agent_end" and ev.get("message"):
                        text = text or ev["message"]
                ChatMessage.objects.create(
                    session_id=session_id_local,
                    role="assistant",
                    content=text or f"{agent_name} completed.",
                    timestamp=timezone.now(),
                    agent=agent_name,
                    agent_events=json.dumps(events),
                    idea_id=str(idea_id_val),
                )
                ChatSession.objects.filter(pk=session_id_local).update(
                    updated_at=timezone.now()
                )
                logger.info(
                    "chat_research_stream: persisted agent msg",
                    extra={"session_id": session_id_local, "agent": agent_name},
                )

            try:
                with requests.post(
                    f"{agent_url}/research/stream",
                    json=payload,
                    stream=True,
                    timeout=(10, None),
                ) as resp:
                    resp.raise_for_status()
                    buffer = ""
                    for chunk in resp.iter_content(chunk_size=None, decode_unicode=True):
                        if not chunk:
                            continue
                        # Forward raw chunk to the browser first for low latency.
                        yield chunk.encode() if isinstance(chunk, str) else chunk

                        # Parse events as they arrive so we can persist per-agent messages.
                        text_chunk = chunk if isinstance(chunk, str) else chunk.decode(
                            "utf-8", errors="ignore"
                        )
                        buffer += text_chunk
                        while "\n\n" in buffer:
                            frame, buffer = buffer.split("\n\n", 1)
                            for line in frame.splitlines():
                                if not line.startswith("data: "):
                                    continue
                                try:
                                    event = json.loads(line[6:])
                                except json.JSONDecodeError:
                                    continue

                                agent_name = event.get("agent") or "system"
                                etype = event.get("type")

                                if etype == "verdict":
                                    final_verdict = event.get("data")
                                    # Persist the verdict + research run so the
                                    # ideas/detail page reflects the result.
                                    try:
                                        _persist_verdict(idea_id_local, final_verdict)
                                    except Exception:
                                        logger.exception(
                                            "chat_research_stream: persist_verdict failed",
                                            extra={"idea_id": idea_id_local},
                                        )

                                if agent_name != "system":
                                    agent_buffers.setdefault(agent_name, []).append(event)
                                    if etype == "agent_end":
                                        persist_agent(
                                            agent_name,
                                            agent_buffers.pop(agent_name, []),
                                            idea_id_local,
                                        )

                    # Flush any agents that never sent an explicit agent_end.
                    for agent_name in list(agent_buffers.keys()):
                        persist_agent(
                            agent_name, agent_buffers.pop(agent_name), idea_id_local
                        )

                    if final_verdict:
                        logger.info(
                            "chat_research_stream: final verdict",
                            extra={
                                "session_id": session_id_local,
                                "idea_id": idea_id_local,
                                "recommendation": final_verdict.get("recommendation"),
                            },
                        )

            except requests.Timeout:
                logger.error(
                    "chat_research_stream: agent connect timeout",
                    extra={"session_id": session_id_local, "idea_id": idea_id_local},
                )
                yield b'data: {"type":"error","message":"Agent service connect timeout"}\n\n'
            except requests.RequestException as exc:
                logger.error(
                    "chat_research_stream: agent error",
                    exc_info=True,
                    extra={
                        "session_id": session_id_local,
                        "idea_id": idea_id_local,
                        "error": str(exc),
                    },
                )
                err = json.dumps({"type": "error", "message": str(exc)})
                yield f"data: {err}\n\n".encode()

        response = StreamingHttpResponse(event_stream(), content_type="text/event-stream")
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"
        return response
