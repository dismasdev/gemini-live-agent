# ------------------------------------------------------------
# Single-image deployment for Cloud Run
# - Builds frontend (Vite)
# - Serves frontend + backend from one FastAPI process
# ------------------------------------------------------------

FROM node:20-alpine AS frontend-builder
WORKDIR /build/frontend

COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate
RUN pnpm install --frozen-lockfile

COPY frontend/ ./
RUN pnpm run build


FROM python:3.12-slim AS runtime
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY app ./app
COPY bidi_streaming_agent ./bidi_streaming_agent

# Copy frontend build output into expected runtime path
COPY --from=frontend-builder /build/frontend/dist ./frontend/dist

EXPOSE 8080

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
