# CPU-oriented aibackends-python image wrapping https://github.com/donvito/aibackends
# For CUDA GPU clouds, prefer the Dockerfile in the aibackends Python repo
# and point this service at that image, or extend it with the FastAPI app.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    AIBACKENDS_SIDECAR_HOST=0.0.0.0 \
    AIBACKENDS_SIDECAR_PORT=8000

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        cmake \
        git \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
# api extra is enough to boot the HTTP layer; install runtime extras as needed.
# Override at build time, e.g.:
#   docker build --build-arg AIBACKENDS_EXTRAS="api,llamacpp,pii" .
ARG AIBACKENDS_EXTRAS="api"
RUN pip install --upgrade pip \
    && pip install -r requirements.txt \
    && if [ "$AIBACKENDS_EXTRAS" != "api" ]; then \
         pip install "aibackends[${AIBACKENDS_EXTRAS}]==0.3.0"; \
       fi

COPY app ./app

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
