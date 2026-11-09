ARG PYTHON_IMAGE=python:3.11-slim
FROM ${PYTHON_IMAGE}
ARG PIP_INDEX_URL=https://pypi.org/simple
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY pyproject.toml .
RUN python -c "import tomllib,subprocess; p=tomllib.load(open('pyproject.toml','rb')); subprocess.check_call(['pip','install','--no-cache-dir',*p['project']['dependencies']])"
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini .
RUN pip install --no-deps --no-cache-dir .
ENV AUTH_MODE=oidc AUTH_DISABLED=0 LEGACY_PASSWORD_LOGIN_ENABLED=0 SEED_DEMO_DATA=0 LEGACY_NEWS_WORKER_ENABLED=0
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
