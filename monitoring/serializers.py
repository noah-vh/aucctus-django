from rest_framework import serializers

from .models import ActivityLog, Job, JobSchedule


class JobSerializer(serializers.ModelSerializer):
    class Meta:
        model = Job
        fields = [
            "id",
            "job_type",
            "target_type",
            "target_id",
            "status",
            "scheduled_at",
            "started_at",
            "completed_at",
            "result_summary",
            "items_processed",
            "items_found",
            "items_new",
            "error",
            "triggered_by",
        ]
        read_only_fields = ["id"]


class JobScheduleSerializer(serializers.ModelSerializer):
    class Meta:
        model = JobSchedule
        fields = [
            "id",
            "job_type",
            "cadence",
            "target_type",
            "target_id",
            "enabled",
            "last_run_at",
            "next_run_at",
        ]
        read_only_fields = ["id"]


class ActivityLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = ActivityLog
        fields = [
            "id",
            "entity_type",
            "entity_id",
            "activity_type",
            "description",
            "details",
            "source",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]
