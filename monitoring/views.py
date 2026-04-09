"""
Views for the monitoring app.

ViewSets:
  JobViewSet         - read-only list/retrieve + create + active action
  ActivityLogViewSet - read-only list/retrieve + recent action
"""

import logging

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.request import Request
from rest_framework.response import Response

from .models import ActivityLog, Job
from .serializers import ActivityLogSerializer, JobSerializer

logger = logging.getLogger(__name__)


class JobViewSet(viewsets.ModelViewSet):
    """
    list    - all jobs ordered by -started_at
    create  - create a new job record
    active  - GET action returning jobs with status="running"
    """

    serializer_class = JobSerializer
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        return Job.objects.all().order_by("-started_at")

    def create(self, request: Request, *args, **kwargs):
        serializer = JobSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        job = serializer.save()
        logger.info(
            "job created",
            extra={"job_id": job.pk, "job_type": job.job_type, "status": job.status},
        )
        return Response(JobSerializer(job).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"], url_path="active")
    def active(self, request: Request):
        """GET /monitoring/jobs/active/ - jobs with status running."""
        jobs = Job.objects.filter(status="running").order_by("-started_at")
        return Response(JobSerializer(jobs, many=True).data)


class ActivityLogViewSet(viewsets.ReadOnlyModelViewSet):
    """
    list   - filter by entity_type and entity_id query params
    recent - GET action returning last 50 across all entities
    """

    serializer_class = ActivityLogSerializer

    def get_queryset(self):
        qs = ActivityLog.objects.all().order_by("-created_at")
        entity_type = self.request.query_params.get("entity_type")
        entity_id = self.request.query_params.get("entity_id")
        if entity_type:
            qs = qs.filter(entity_type=entity_type)
        if entity_id:
            qs = qs.filter(entity_id=entity_id)
        return qs

    @action(detail=False, methods=["get"], url_path="recent")
    def recent(self, request: Request):
        """GET /monitoring/activity/recent/ - last 50 activity log entries."""
        logs = ActivityLog.objects.order_by("-created_at")[:50]
        return Response(ActivityLogSerializer(logs, many=True).data)
