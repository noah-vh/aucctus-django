from django.contrib import admin

from .models import ChatMessage, ChatSession


@admin.register(ChatSession)
class ChatSessionAdmin(admin.ModelAdmin):
    list_display = ["id", "title", "status", "idea", "created_at", "updated_at"]
    list_filter = ["status"]
    search_fields = ["title"]
    raw_id_fields = ["idea"]


@admin.register(ChatMessage)
class ChatMessageAdmin(admin.ModelAdmin):
    list_display = ["id", "session", "role", "agent", "timestamp"]
    list_filter = ["role", "agent"]
    search_fields = ["content"]
    raw_id_fields = ["session"]
