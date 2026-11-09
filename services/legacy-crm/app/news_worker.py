"""Run with python -m app.news_worker. Database must be migrated by API first."""
import logging
import os
import time
from .database import build_session_factory
from . import models, studio_models  # register mappings
from .industry import tick

def main():
    if os.getenv("LEGACY_NEWS_WORKER_ENABLED", "0") != "1":
        logging.info("Legacy news scheduler is disabled; the unified workbench owns collection and briefing.")
        return
    _, factory = build_session_factory(os.getenv("DATABASE_URL", "sqlite:///./affiliate_workbench.db"))
    while True:
        try:
            tick(factory)
        except Exception:
            logging.exception("Morning edition worker failed; retrying next tick")
        time.sleep(15)

if __name__ == "__main__":
    main()
