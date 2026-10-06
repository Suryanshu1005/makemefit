# Production Dockerfile for MakeMeFit API
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy root workspace configurations
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy source files
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

# Build shared package and API
RUN pnpm --filter @makemefit/shared build
RUN pnpm --filter @makemefit/api build

# Production runtime stage
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# Install only production dependencies
RUN pnpm install --prod --frozen-lockfile

# Copy built artifacts from builder stage
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/drizzle.config.ts ./apps/api/
COPY --from=builder /app/apps/api/src/database ./apps/api/src/database

WORKDIR /app/apps/api

EXPOSE 4000

CMD ["node", "dist/index.js"]
