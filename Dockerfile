FROM node:24-bookworm-slim AS base

WORKDIR /app

ENV PNPM_HOME=/pnpm
ENV PNPM_STORE_DIR=/pnpm/store
ENV PATH=$PNPM_HOME:$PATH

RUN npm install -g pnpm@11.2.2

FROM base AS dev

EXPOSE 3000

CMD ["sh", "-lc", "pnpm install --store-dir /pnpm/store && (chown -R node:node /app/node_modules /pnpm/store /app/pnpm-lock.yaml /app/.next 2>/dev/null || true) && su node -c 'pnpm dev --hostname 0.0.0.0'"]

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --store-dir /pnpm/store

FROM base AS builder

ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_TELEMETRY_DISABLED=1
ENV TUTI_TARGET=web

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build:web

FROM node:24-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node

EXPOSE 3000

CMD ["node", "server.js"]
