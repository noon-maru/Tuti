FROM node:24-bookworm-slim

WORKDIR /app

ENV PNPM_HOME=/pnpm
ENV PNPM_STORE_DIR=/pnpm/store
ENV PATH=$PNPM_HOME:$PATH

RUN npm install -g pnpm@11.2.2

EXPOSE 3000

CMD ["sh", "-lc", "pnpm install --store-dir /pnpm/store && (chown -R node:node /app/node_modules /pnpm/store /app/pnpm-lock.yaml /app/.next 2>/dev/null || true) && su node -c 'pnpm dev --hostname 0.0.0.0'"]
