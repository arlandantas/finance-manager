# ADR-026: imagem de produção (Railway). Multi-stage, standalone, usuário não root.
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat openssl
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# `postinstall` roda `prisma generate`: precisa do schema e da config.
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm exec prisma generate && pnpm exec next build

# Ferramentas de migração isoladas (o pre-deploy do Railway roda `prisma migrate deploy` aqui).
FROM base AS migrate
WORKDIR /opt/migrate
RUN npm init -y >/dev/null && npm install --no-audit --no-fund prisma@7.10.0 dotenv@18
COPY prisma ./prisma
COPY prisma.config.ts ./

FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
# Gravado na imagem: ativa as travas do ADR-026 §5 (login de teste/homologação impossíveis).
ENV NODE_ENV=production \
    APP_DEPLOY_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
RUN addgroup -S -g 1001 app && adduser -S -u 1001 -G app app
COPY --from=builder --chown=app:app /app/public ./public
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
COPY --from=migrate --chown=app:app /opt/migrate /opt/migrate
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/api/health >/dev/null || exit 1
CMD ["node", "server.js"]
