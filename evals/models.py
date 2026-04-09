from django.db import models

from ideas.models import ResearchRun


class EvalScore(models.Model):
    run = models.ForeignKey(
        ResearchRun, on_delete=models.SET_NULL, null=True, blank=True, related_name="eval_scores"
    )
    agent_name = models.CharField(max_length=100)
    metric = models.CharField(max_length=100)
    score = models.FloatField()
    details = models.TextField(null=True, blank=True)
    evaluated_at = models.DateTimeField()

    class Meta:
        ordering = ["-evaluated_at"]

    def __str__(self):
        return f"{self.agent_name} / {self.metric}: {self.score}"
