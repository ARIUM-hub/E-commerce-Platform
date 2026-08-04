#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ! "${COMMIT_SHA:-}" =~ ^[a-f0-9]{40}$ ]]; then
  echo "COMMIT_SHA must be a 40 character lowercase hexadecimal revision" >&2
  exit 2
fi
if [[ -z "${APP_IMAGE:-}" || "$APP_IMAGE" != *":$COMMIT_SHA" ]]; then
  echo "APP_IMAGE must use the requested commit SHA tag" >&2
  exit 2
fi
if [[ ! -f .env.production ]]; then
  echo ".env.production is required" >&2
  exit 2
fi

compose=(docker compose --env-file .env.production -f compose.production.yml)
SERVICE_VERSION="$COMMIT_SHA" "${compose[@]}" config --quiet

previous_image="$(docker inspect --format '{{.Config.Image}}' socks-store-app-1 2>/dev/null || true)"
previous_version="${previous_image##*:}"

wait_until_ready() {
  for attempt in $(seq 1 20); do
    status="$(docker inspect --format '{{.State.Health.Status}}' socks-store-app-1 2>/dev/null || true)"
    if [[ "$status" == "healthy" ]]; then
      return 0
    fi
    if [[ "$status" == "unhealthy" ]]; then
      return 1
    fi
    sleep 3
  done
  return 1
}

rollback() {
  if [[ -z "$previous_image" ]]; then
    echo "no previous image is available for rollback" >&2
    return 1
  fi
  echo "rolling back application image to $previous_image" >&2
  APP_IMAGE="$previous_image" SERVICE_VERSION="$previous_version" "${compose[@]}" up -d app
  wait_until_ready
}

persist_image_reference() {
  umask 077
  printf 'APP_IMAGE=%s\nSERVICE_VERSION=%s\n' "$APP_IMAGE" "$COMMIT_SHA" > .env.image.tmp
  mv .env.image.tmp .env.image
}

if [[ -n "$previous_image" ]]; then
  if [[ ! "$previous_version" =~ ^[a-f0-9]{7,40}$ ]]; then
    echo "the current application image must use a hexadecimal revision tag" >&2
    exit 1
  fi
  APP_IMAGE="$previous_image" SERVICE_VERSION="$previous_version" "${compose[@]}" --profile ops run --rm backup
else
  echo "first deployment: no existing application database is available to back up"
fi

APP_IMAGE="$APP_IMAGE" SERVICE_VERSION="$COMMIT_SHA" "${compose[@]}" pull app
APP_IMAGE="$APP_IMAGE" SERVICE_VERSION="$COMMIT_SHA" "${compose[@]}" run --rm app node scripts/migrate-database.js
APP_IMAGE="$APP_IMAGE" SERVICE_VERSION="$COMMIT_SHA" "${compose[@]}" up -d app caddy

if ! wait_until_ready; then
  echo "new application container did not become healthy" >&2
  rollback
  exit 1
fi

if ! persist_image_reference; then
  echo "failed to persist the approved application image" >&2
  rollback
  exit 1
fi

echo "deployment completed for $COMMIT_SHA"
