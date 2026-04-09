import os
from celery import Celery
from celery.schedules import crontab

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

app = Celery("aucctus")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

app.conf.beat_schedule = {
    "funding-pulse": {
        "task": "monitoring.tasks.funding_pulse",
        "schedule": crontab(hour=6, minute=0),
    },
    "news-monitor": {
        "task": "monitoring.tasks.news_monitor",
        "schedule": crontab(hour=6, minute=30),
    },
    "weekly-rescan": {
        "task": "monitoring.tasks.weekly_rescan",
        "schedule": crontab(hour=9, minute=0, day_of_week=1),
    },
    "hiring-velocity": {
        "task": "monitoring.tasks.hiring_velocity",
        "schedule": crontab(hour=9, minute=0, day_of_week=3),
    },
    "signal-digest": {
        "task": "monitoring.tasks.signal_digest",
        "schedule": crontab(hour=9, minute=30, day_of_week=1),
    },
    "stale-check": {
        "task": "monitoring.tasks.stale_check",
        "schedule": crontab(hour=10, minute=0, day_of_month=1),
    },
}
