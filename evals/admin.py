from django.contrib import admin

from .models import EvalScore


@admin.register(EvalScore)
class EvalScoreAdmin(admin.ModelAdmin):
    list_display = ["agent_name", "metric", "score", "run", "evaluated_at"]
    list_filter = ["agent_name", "metric"]
    search_fields = ["agent_name", "metric", "details"]
    raw_id_fields = ["run"]
