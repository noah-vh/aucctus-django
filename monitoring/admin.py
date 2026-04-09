from django.contrib import admin

from .models import ActivityLog, Job, JobSchedule


@admin.register(Job)
class JobAdmin(admin.ModelAdmin):
    list_display = ["id", "job_type", "target_type", "status", "triggered_by", "scheduled_at"]
    list_filter = ["status", "job_type", "triggered_by"]
    search_fields = ["job_type", "target_type", "target_id"]


@admin.register(JobSchedule)
class JobScheduleAdmin(admin.ModelAdmin):
    list_display = ["id", "job_type", "cadence", "target_type", "enabled", "next_run_at"]
    list_filter = ["enabled", "job_type"]
    search_fields = ["job_type", "target_type"]


@admin.register(ActivityLog)
class ActivityLogAdmin(admin.ModelAdmin):
    list_display = ["activity_type", "entity_type", "entity_id", "source", "created_at"]
    list_filter = ["activity_type", "entity_type", "source"]
    search_fields = ["description", "entity_id"]
