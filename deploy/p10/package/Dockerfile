# P104: locked observed P10.2 bases; no registry push, no target-side build.
FROM node:24-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54 AS frontend
ARG SOURCE_DATE_EPOCH
WORKDIR /src/frontend
COPY frontend/ ./
RUN npm ci --ignore-scripts --no-audit && npx tsc -b --noEmit && npx vite build --config vite.web.config.ts
FROM python:3.12-slim-bookworm@sha256:935c3c5b12357a7e10caa9c1e6ca5692344d97cf229832ef584be2cec9fc03df
ARG SOURCE_DATE_EPOCH
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 SERVE_FRONTEND_DIR=/app/web APOLLO_ENV=homologation
COPY wheels/ /tmp/wheels/
RUN python -m pip install --no-cache-dir --no-compile --no-index --find-links /tmp/wheels --require-hashes -r /tmp/wheels/requirements.hashed.txt && rm -rf /tmp/wheels
COPY backend/ /app/backend/
COPY --from=frontend /src/frontend/dist-web/ /app/web/
WORKDIR /app/backend
USER 10001:10001
EXPOSE 10000
CMD ["python","tools/p10_environment.py","serve"]
