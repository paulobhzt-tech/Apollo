FROM node:22-bookworm-slim AS frontend-build
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN --mount=type=secret,id=build_ca \
    if [ -f /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi; \
    npm ci --legacy-peer-deps --no-audit --no-fund
COPY frontend/ ./
ARG APOLLO_SOURCE_COMMIT
ARG RENDER_GIT_COMMIT
RUN export APOLLO_SOURCE_COMMIT="${APOLLO_SOURCE_COMMIT:-${RENDER_GIT_COMMIT:-}}" \
    && test -n "$APOLLO_SOURCE_COMMIT" \
    && npm run build \
    && EXPECTED_COMMIT="$APOLLO_SOURCE_COMMIT" node scripts/verify-build.mjs

FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 SERVE_FRONTEND_DIR=/app/web
WORKDIR /app
COPY backend/requirements.txt /app/backend/requirements.txt
RUN --mount=type=secret,id=build_ca \
    if [ -f /run/secrets/build_ca ]; then export PIP_CERT=/run/secrets/build_ca; fi; \
    python -m pip install --no-cache-dir -r /app/backend/requirements.txt --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/
COPY backend/ /app/backend/
COPY --from=frontend-build /src/frontend/dist/ /app/web/
WORKDIR /app/backend
CMD ["sh", "-c", "exec uvicorn server:app --host 0.0.0.0 --port ${PORT:-10000}"]
