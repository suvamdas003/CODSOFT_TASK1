# syntax=docker/dockerfile:1
# Multi-stage build for EduManage.
#   target "runner"   – slim production image (Next.js standalone server, non-root)
#   target "migrator" – full toolchain to run `prisma migrate deploy` and the demo seed
ARG NODE_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Placeholder so `prisma generate` / `next build` can load prisma.config.ts.
# The real connection string is provided at runtime by docker compose.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"

# ── Dependencies (cached until package files or schema change) ──
FROM base AS deps
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

# ── Build ──
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

# ── Migrations / seed runner ──
FROM builder AS migrator
# Fail the build early if the Prisma schema engine is unavailable for this platform.
RUN npx prisma --version
# Production by default, so the demo seed refuses to run against a real database.
# Only the separate demo stack (docker-compose.demo.yml) overrides this.
ENV NODE_ENV=production
CMD ["npx", "prisma", "migrate", "deploy"]

# ── Production runtime ──
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
