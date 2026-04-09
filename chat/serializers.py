from rest_framework import serializers

from .models import ChatMessage, ChatSession


class ChatSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChatSession
        fields = [
            "id",
            "title",
            "created_at",
            "updated_at",
            "status",
            "idea",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class ChatSessionCreateSerializer(serializers.ModelSerializer):
    title = serializers.CharField(default="New research", allow_blank=False, max_length=500)

    class Meta:
        model = ChatSession
        fields = ["title", "idea"]

    def create(self, validated_data):
        validated_data.setdefault("status", "active")
        return super().create(validated_data)


class ChatMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChatMessage
        fields = [
            "id",
            "session",
            "role",
            "content",
            "timestamp",
            "agent",
            "agent_events",
            "idea_id",
        ]
        read_only_fields = ["id"]


class ChatMessageCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChatMessage
        fields = ["session", "role", "content", "agent", "agent_events", "idea_id"]


class ChatMessageUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChatMessage
        fields = ["content", "agent_events", "idea_id"]
        # All fields optional for PATCH
        extra_kwargs = {
            "content": {"required": False},
            "agent_events": {"required": False},
            "idea_id": {"required": False},
        }
