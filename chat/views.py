"""
Views for the chat app.

ViewSets:
  ChatSessionViewSet  - list active sessions, create, destroy, archive action
  ChatMessageViewSet  - list by session, create (bumps session updated_at), partial_update
"""

import logging

from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.request import Request
from rest_framework.response import Response

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
