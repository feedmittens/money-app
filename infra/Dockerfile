# ── Stage 1: build client ────────────────────────────────────────────────────
FROM node:22-alpine AS client-builder

WORKDIR /app
COPY client/package*.json ./client/
RUN npm ci --prefix client
COPY client/ ./client/
RUN npm run build --prefix client

# ── Stage 2: install server dependencies ────────────────────────────────────
FROM node:22-alpine AS server-deps

WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --production

# ── Stage 3: runtime (nginx + node) ──────────────────────────────────────────
FROM node:22-alpine

RUN apk add --no-cache nginx

# nginx config
COPY infra/nginx.conf /etc/nginx/http.d/default.conf

# Built client static files
COPY --from=client-builder /app/client/dist /usr/share/nginx/html

# API server
COPY --from=server-deps /app/server/node_modules /app/server/node_modules
COPY server/ /app/server/

# Startup script
COPY infra/docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 80
CMD ["/entrypoint.sh"]
