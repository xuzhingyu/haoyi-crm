ARG PYTHON_IMAGE=python:3.11-slim
FROM ${PYTHON_IMAGE}
ARG PIP_INDEX_URL=https://pypi.org/simple

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app
COPY pyproject.toml ./
RUN pip install --index-url ${PIP_INDEX_URL} --upgrade pip && \
    python -c "import tomllib; print('\n'.join(tomllib.load(open('pyproject.toml','rb'))['project']['dependencies']))" > /tmp/requirements.txt && \
    pip install --index-url ${PIP_INDEX_URL} -r /tmp/requirements.txt hatchling
COPY src ./src
COPY alembic.ini ./
COPY alembic ./alembic
RUN pip install --no-deps --no-build-isolation .

RUN useradd --create-home --uid 10001 leadcore && chown -R leadcore:leadcore /app
USER leadcore

EXPOSE 8000
CMD ["python", "-m", "lead_core"]
