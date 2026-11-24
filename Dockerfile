FROM node:26.12.1-bookworm-slim AS base

WORKDIR /app

ENV PNPM_HOME=/pnpm
ENV PNPM_STORE_DIR=/pnpm/store
ENV PATH=$PNPM_HOME:$PATH

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@11.2.2

FROM base AS dev

ARG DEV_UID=1000
ARG DEV_GID=1000

RUN set -eux; \
  target_group="$(getent group "${DEV_GID}" | cut -d: -f1 || true)"; \
  if [ -z "${target_group}" ]; then \
    groupmod --gid "${DEV_GID}" node; \
    target_group=node; \
  fi; \
  usermod --uid "${DEV_UID}" --gid "${target_group}" node

EXPOSE 3000

CMD ["sh", "-lc", "CI=true pnpm install --frozen-lockfile --store-dir /pnpm/store && (chown -R node:\"$(id -gn node)\" /app/node_modules /pnpm/store /app/pnpm-lock.yaml /app/.next /app/src/generated 2>/dev/null || true) && su node -c 'pnpm dev --hostname 0.0.0.0'"]

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --store-dir /pnpm/store

FROM base AS builder

# 운영 배포 전 셸 도구 회귀 시험에서도 NAS와 같은 JSON 처리기를 사용한다.
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends jq \
  && jq --version \
  && rm -rf /var/lib/apt/lists/*

ARG DATABASE_URL=postgresql://tuti_user:tuti_password@localhost:5432/tuti?schema=public
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_ACCOUNT_AUTH_ENABLED=true
ARG NEXT_PUBLIC_SOCIAL_OAUTH_ENABLED=false
ARG NEXT_PUBLIC_APPLE_OAUTH_ENABLED=false
ARG NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED=false
ARG NEXT_PUBLIC_KAKAO_OAUTH_ENABLED=false
ARG NEXT_PUBLIC_MADI_PUBLICATION_ENABLED=false
ARG NEXT_PUBLIC_MADI_PUBLICATION_AUDIENCE=internal
ENV DATABASE_URL=$DATABASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_ACCOUNT_AUTH_ENABLED=$NEXT_PUBLIC_ACCOUNT_AUTH_ENABLED
ENV NEXT_PUBLIC_SOCIAL_OAUTH_ENABLED=$NEXT_PUBLIC_SOCIAL_OAUTH_ENABLED
ENV NEXT_PUBLIC_APPLE_OAUTH_ENABLED=$NEXT_PUBLIC_APPLE_OAUTH_ENABLED
ENV NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED=$NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED
ENV NEXT_PUBLIC_KAKAO_OAUTH_ENABLED=$NEXT_PUBLIC_KAKAO_OAUTH_ENABLED
ENV NEXT_PUBLIC_MADI_PUBLICATION_ENABLED=$NEXT_PUBLIC_MADI_PUBLICATION_ENABLED
ENV NEXT_PUBLIC_MADI_PUBLICATION_AUDIENCE=$NEXT_PUBLIC_MADI_PUBLICATION_AUDIENCE
ENV NEXT_TELEMETRY_DISABLED=1
ENV TUTI_TARGET=web

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN node scripts/check-node-runtime.mjs && pnpm build:web

FROM builder AS verified-ops

ARG TUTI_BUILD_REVISION
# 테스트 실패 시 이 단계와 검증 라벨을 가진 이미지는 생성되지 않는다.
# 운영 연결정보 없이, 외부 네트워크가 차단된 Actions 빌드 환경에서 실행한다.
RUN --network=none test "${#TUTI_BUILD_REVISION}" -eq 40 \
  && ! printf '%s' "$TUTI_BUILD_REVISION" | grep -q '[^0-9a-f]' \
  && pnpm test
LABEL com.tuti.verification="full-suite-v1"
LABEL org.opencontainers.image.revision=$TUTI_BUILD_REVISION

FROM node:26.12.1-bookworm-slim AS runner

LABEL com.tuti.harumadi-layout="automatic"

WORKDIR /app

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/scripts/check-node-runtime.mjs ./scripts/check-node-runtime.mjs

RUN node scripts/check-node-runtime.mjs

USER node

EXPOSE 3000

CMD ["node", "server.js"]
