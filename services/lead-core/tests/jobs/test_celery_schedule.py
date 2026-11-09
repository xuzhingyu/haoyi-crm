from lead_core.jobs.celery_app import celery_app


def test_celery_registers_inventory_lifecycle_and_outbox_schedules() -> None:
    schedule = celery_app.conf.beat_schedule

    assert set(schedule) == {
        "daily-city-replenishment",
        "claim-lifecycle-maintenance",
        "twenty-outbox-dispatch",
        "source-snapshot-retention",
        "intelligence-ten-minute-sync",
        "intelligence-weekday-briefing",
        "crm-confirmation-reconcile",
        "company-daily-collection",
    }
    assert schedule["daily-city-replenishment"]["task"] == "lead_core.replenish_all_cities"
    assert schedule["claim-lifecycle-maintenance"]["task"] == "lead_core.maintain_claims"
    assert schedule["twenty-outbox-dispatch"]["task"] == "lead_core.dispatch_twenty_outbox"
    assert schedule["source-snapshot-retention"]["task"] == "lead_core.purge_source_snapshots"
    assert celery_app.conf.timezone == "Asia/Shanghai"
    assert schedule["intelligence-ten-minute-sync"]["schedule"].minute == {0, 10, 20, 30, 40, 50}
    assert schedule["intelligence-ten-minute-sync"]["schedule"].hour == set(range(24))
    assert schedule["intelligence-weekday-briefing"]["schedule"].day_of_week == {1, 2, 3, 4, 5}
