from celery import Celery
from celery.schedules import crontab

from lead_core.config import Settings

_settings = Settings(
    environment="development",
    auth_mode="dev",
    sensitive_data_key="",
    twenty_sync_enabled=False,
)

celery_app = Celery(
    "lead_core",
    broker=_settings.redis_url,
    backend=_settings.redis_url,
    include=["lead_core.jobs.tasks", "lead_core.intelligence.jobs", "lead_core.company_intelligence.jobs"],
)
celery_app.conf.update(
    timezone="Asia/Shanghai",
    enable_utc=True,
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    beat_schedule={
        "company-daily-collection": {"task": "lead_core.company_daily_collection", "schedule": crontab(hour=8, minute=45)},
        "crm-confirmation-reconcile": {"task": "lead_core.crm_confirmation_reconcile", "schedule": crontab(minute="*")},
        "intelligence-ten-minute-sync": {"task": "lead_core.intelligence_sync", "schedule": crontab(minute="*/10")},
        "intelligence-weekday-briefing": {"task": "lead_core.intelligence_briefing", "schedule": crontab(hour=8, minute=30, day_of_week="1-5")},
        "daily-city-replenishment": {
            "task": "lead_core.replenish_all_cities",
            "schedule": crontab(hour=2, minute=0),
        },
        "claim-lifecycle-maintenance": {
            "task": "lead_core.maintain_claims",
            "schedule": crontab(minute="*/15"),
        },
        "twenty-outbox-dispatch": {
            "task": "lead_core.dispatch_twenty_outbox",
            "schedule": crontab(minute="*"),
        },
        "source-snapshot-retention": {
            "task": "lead_core.purge_source_snapshots",
            "schedule": crontab(hour=3, minute=15),
        },
    },
)
