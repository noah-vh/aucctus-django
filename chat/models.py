from django.db import models

from ideas.models import Idea


class ChatSession(models.Model):
    title = models.CharField(max_length=500)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    status = models.CharField(max_length=20, default="active")
    idea = models.ForeignKey(
        Idea, on_delete=models.SET_NULL, null=True, blank=True, related_name="chat_sessions"
    )

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return self.title[:80]


class ChatMessage(models.Model):
    session = models.ForeignKey(ChatSession, on_delete=models.CASCADE, related_name="messages")
    role = models.CharField(max_length=20)
    content = models.TextField()
    timestamp = models.DateTimeField()
    agent = models.CharField(max_length=50, null=True, blank=True)
    agent_events = models.TextField(null=True, blank=True)  # JSON string of AgentEvent[]
    idea_id = models.CharField(max_length=50, null=True, blank=True)

    class Meta:
        ordering = ["timestamp"]

    def __str__(self):
        return f"[{self.role}] {self.content[:60]}"
