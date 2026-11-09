"""Run the versioned migrations using the existing runtime database setting."""
from alembic.config import Config

from alembic import command
from lead_core.config import Settings

if __name__ == "__main__":
    config = Config("alembic.ini")
    config.set_main_option("sqlalchemy.url", Settings().database_url.replace("%", "%%"))
    command.upgrade(config, "head")
