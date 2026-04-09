from django.db import models


class Job(models.Model):
    job_type = models.CharField(max_length=100)
    target_type = models.CharField(max_length=100)
    target_id = models.CharField(max_length=100, null=True, blank=True)
    status = models.CharField(max_length=20, default="pending")
    scheduled_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    result_summary = models.TextField(null=True, blank=True)
    items_processed = models.IntegerField(null=True, blank=True)
    items_found = models.IntegerField(null=True, blank=True)
    items_new = models.IntegerField(null=True, blank=True)
    error = models.TextField(null=True, blank=True)
    triggered_by = models.CharField(max_length=50, default="system")

    class Meta:
        ordering = ["-scheduled_at"]

    def __str__(self):
        return f"{self.job_type} [{self.status}] - {self.target_type}"


class JobSchedule(models.Model):
    job_type = models.CharField(max_length=100)
    cadence = models.CharField(max_length=100)
    target_type = models.CharField(max_length=100)
    target_id = models.CharField(max_length=100, null=True, blank=True)
    enabled = models.BooleanField(default=True)
    last_run_at = models.DateTimeField(null=True, blank=True)
    next_run_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["job_type"]

    def __str__(self):
        return f"{self.job_type} ({self.cadence}) - {'enabled' if self.enabled else 'disabled'}"


class ActivityLog(models.Model):
    entity_type = models.CharField(max_length=100)
    entity_id = models.CharField(max_length=100)
    activity_type = models.CharField(max_length=100)
    description = models.TextField()
    details = models.TextField(null=True, blank=True)
    source = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.activity_type} on {self.entity_type}/{self.entity_id}"
