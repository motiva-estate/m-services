# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# Install OS deps needed by native modules (bcrypt uses node-gyp)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy manifests first to leverage Docker layer caching
COPY package*.json ./
RUN npm ci --include=dev

# Copy source and compile
COPY . .
RUN npm run build

# ── Stage 2: Production image ─────────────────────────────────────────────────
FROM node:20-alpine AS runner

# sharp needs libvips; bcrypt needs libc compat on Alpine
RUN apk add --no-cache \
    vips-dev \
    python3 \
    make \
    g++

WORKDIR /app

# Only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

# Non-root user for security
RUN addgroup -S motiva && adduser -S motiva -G motiva
USER motiva

# Render sets PORT via env; default to 4000 locally
ENV PORT=4000
ENV NODE_ENV=production

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:${PORT}/api/health || exit 1

CMD ["node", "dist/main"]
