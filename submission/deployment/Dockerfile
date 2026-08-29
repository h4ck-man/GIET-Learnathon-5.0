# Multi-stage hardened production Dockerfile
FROM node:22-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN npm run typecheck

FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

# Install better-sqlite3 runtime dependencies
RUN apk add --no-cache dumb-init

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/.svelte-kit ./.svelte-kit
COPY --from=builder /app/src ./src
COPY --from=builder /app/static ./static
COPY --from=builder /app/tsconfig*.json ./

RUN mkdir -p /app/data /app/uploads && chown -R node:node /app

USER node
EXPOSE 3001 5173

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["npm", "run", "dev:all"]
