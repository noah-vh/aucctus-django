"""
Celery periodic tasks for continuous intelligence monitoring.
These call the agent service HTTP API to run lightweight searches.
"""
import logging
from datetime import timedelta

import requests
from celery import shared_task
from django.conf import settings
from django.utils import timezone

from ideas.models import Idea, Company, IntelSignal
from monitoring.models import Job, JobSchedule, ActivityLog

logger = logging.getLogger(__name__)

AGENT_URL = getattr(settings, "AGENT_SERVICE_URL", "http://localhost:4000")


def should_skip(job_type: str, idea_id: int) -> bool:
    """Check if a job should be skipped based on schedule overrides."""
    override = JobSchedule.objects.filter(
        job_type=job_type, target_id=str(idea_id)
    ).first()
    if override and not override.enabled:
        return True
    return False


def create_job(job_type: str, target_type: str = "global", triggered_by: str = "cron") -> Job:
    return Job.objects.create(
        job_type=job_type,
        target_type=target_type,
        status="running",
        triggered_by=triggered_by,
        started_at=timezone.now(),
    )


def complete_job(job: Job, summary: str, processed: int = 0, found: int = 0, new: int = 0):
    job.status = "completed"
    job.completed_at = timezone.now()
    job.result_summary = summary
    job.items_processed = processed
    job.items_found = found
    job.items_new = new
    job.save()


def fail_job(job: Job, error: str):
    job.status = "failed"
    job.completed_at = timezone.now()
    job.error = error
    job.save()


@shared_task
def funding_pulse():
    """Daily check for new funding across active ideas."""
    job = create_job("funding_pulse")
    ideas = Idea.objects.filter(status="active")
    total_new = 0

    for idea in ideas:
        if should_skip("funding_pulse", idea.id):
            continue
        try:
            resp = requests.post(
                f"{AGENT_URL}/monitor/funding-pulse",
                json={"idea_id": idea.id, "description": idea.description},
                timeout=30,
            )
            if resp.ok:
                data = resp.json()
                total_new += data.get("new_events", 0)
        except Exception as e:
            logger.error(f"Funding pulse failed for idea {idea.id}: {e}")

    complete_job(job, f"Checked {ideas.count()} ideas, {total_new} new funding events", ideas.count(), total_new, total_new)


@shared_task
def news_monitor():
    """Daily check for company news."""
    job = create_job("news_monitor")
    companies = Company.objects.filter(idea__status="active")[:20]
    total_signals = 0

    for company in companies:
        try:
            resp = requests.post(
                f"{AGENT_URL}/monitor/news",
                json={"company_name": company.name, "idea_id": company.idea_id},
                timeout=30,
            )
            if resp.ok:
                data = resp.json()
                total_signals += data.get("signals_created", 0)
        except Exception as e:
            logger.error(f"News monitor failed for {company.name}: {e}")

    complete_job(job, f"Scanned {companies.count()} companies, {total_signals} signals", companies.count(), total_signals, total_signals)


@shared_task
def weekly_rescan():
    """Weekly full research run for all active ideas."""
    job = create_job("full_rescan")
    ideas = Idea.objects.filter(status="active")

    for idea in ideas:
        if should_skip("full_rescan", idea.id):
            continue
        try:
            # Fire and forget - agent service handles the full pipeline
            requests.post(
                f"{AGENT_URL}/research/run",
                json={"description": idea.description, "idea_id": idea.id},
                timeout=5,  # Just start it, don't wait
            )
        except Exception as e:
            logger.error(f"Rescan failed for idea {idea.id}: {e}")

    complete_job(job, f"Queued rescan for {ideas.count()} active ideas", ideas.count())


@shared_task
def hiring_velocity():
    """Weekly check for hiring trends."""
    job = create_job("hiring_velocity")
    ideas = Idea.objects.filter(status="active")
    total_signals = 0

    for idea in ideas:
        if should_skip("hiring_velocity", idea.id):
            continue
        try:
            resp = requests.post(
                f"{AGENT_URL}/monitor/hiring",
                json={"idea_id": idea.id, "description": idea.description},
                timeout=30,
            )
            if resp.ok:
                data = resp.json()
                total_signals += data.get("signals_created", 0)
        except Exception as e:
            logger.error(f"Hiring check failed for idea {idea.id}: {e}")

    complete_job(job, f"Checked {ideas.count()} ideas, {total_signals} hiring signals", ideas.count(), total_signals, total_signals)


@shared_task
def signal_digest():
    """Weekly summary of signals from the past 7 days."""
    job = create_job("signal_digest")
    cutoff = timezone.now() - timedelta(days=7)
    signals = IntelSignal.objects.filter(detected_at__gte=cutoff)

    by_idea = {}
    for sig in signals:
        idea_id = sig.idea_id
        if idea_id not in by_idea:
            by_idea[idea_id] = []
        by_idea[idea_id].append(sig)

    high_count = signals.filter(severity="high").count()
    summary = f"{signals.count()} signals across {len(by_idea)} ideas, {high_count} high severity"

    complete_job(job, summary, signals.count(), signals.count())


@shared_task
def stale_check():
    """Monthly check for companies not seen in 90+ days."""
    job = create_job("stale_check")
    cutoff = timezone.now() - timedelta(days=90)
    stale = Company.objects.filter(last_seen__lt=cutoff)

    for company in stale:
        IntelSignal.objects.create(
            idea=company.idea,
            signal_type="pivot",
            description=f"Company '{company.name}' not seen in 90+ days - may have pivoted or shut down",
            severity="low",
            detected_at=timezone.now(),
        )

    complete_job(job, f"{stale.count()} stale companies flagged", stale.count(), stale.count(), stale.count())
