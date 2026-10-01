# syntax=docker/dockerfile:1
#
# c0upons.com, run on Bun.
#
# This file lives at .nixpacks/Dockerfile because that is the path dev2's compose
# stack builds (cli-tools dev2/dev2-site provision records it per site). It used to
# be nixpacks output (Node + pnpm); it is now a hand-written Bun image, so do not
# regenerate it with nixpacks.
#
# Contract with /home/anthony/www/c0upons.com on dev2, unchanged: listens on 3000
# inside the container, answers / for the deploy health check, reads its secrets
# from app.env at run time. NEXT_PUBLIC_BASE_URL arrives as a compose build arg.

FROM oven/bun:1.4.0-slim AS deps
WORKDIR /app
# The whole workspace manifest set: bun installs per-package trees.
COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/package.json
COPY apps/cli/package.json apps/cli/package.json
RUN bun install --frozen-lockfile

FROM deps AS build
COPY . .
ARG NEXT_PUBLIC_BASE_URL
ENV NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL
ENV NEXT_TELEMETRY_DISABLED=1 TURBO_TELEMETRY_DISABLED=1
# turbo -> `bun --bun next build` in apps/web: Next builds on Bun, not Node.
RUN bun run build:web

FROM oven/bun:1.4.0-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# Docker sets HOSTNAME to the container id and Next's standalone server binds to it
# literally; it must listen on every interface for the published port to reach it.
ENV HOSTNAME=0.0.0.0
# Standalone output traced from the workspace root keeps the apps/web/ layout.
COPY --from=build --chown=bun:bun /app/apps/web/.next/standalone ./
COPY --from=build --chown=bun:bun /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=bun:bun /app/apps/web/public ./apps/web/public
USER bun
EXPOSE 3000
# 127.0.0.1, not localhost: localhost resolves ::1 first and Next binds IPv4 only.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
CMD ["bun", "apps/web/server.js"]
