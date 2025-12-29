# Automaker Multi-Stage Dockerfile
# Single Dockerfile for both server and UI builds
# Usage:
#   docker build --target server -t automaker-server .
#   docker build --target ui -t automaker-ui .
# Or use docker-compose which selects targets automatically

# =============================================================================
# BASE STAGE - Common setup for all builds (DRY: defined once, used by all)
# =============================================================================
FROM node:22-alpine AS base

# Install build dependencies for native modules (node-pty)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy root package files
COPY package*.json ./

# Copy all libs package.json files (centralized - add new libs here)
COPY libs/types/package*.json ./libs/types/
COPY libs/utils/package*.json ./libs/utils/
COPY libs/prompts/package*.json ./libs/prompts/
COPY libs/platform/package*.json ./libs/platform/
COPY libs/model-resolver/package*.json ./libs/model-resolver/
COPY libs/dependency-resolver/package*.json ./libs/dependency-resolver/
COPY libs/git-utils/package*.json ./libs/git-utils/

# Copy scripts (needed by npm workspace)
COPY scripts ./scripts

# =============================================================================
# SERVER BUILD STAGE
# =============================================================================
FROM base AS server-builder

# Copy server-specific package.json
COPY apps/server/package*.json ./apps/server/

# Install dependencies (--ignore-scripts to skip husky/prepare, then rebuild native modules)
RUN npm ci --ignore-scripts && npm rebuild node-pty

# Copy all source files
COPY libs ./libs
COPY apps/server ./apps/server

# Build packages in dependency order, then build server
RUN npm run build:packages && npm run build --workspace=apps/server

# =============================================================================
# SERVER PRODUCTION STAGE
# =============================================================================
FROM node:22-alpine AS server

# Install git, curl, bash (for terminal), and GitHub CLI (pinned version, multi-arch)
RUN apk add --no-cache git curl bash && \
    GH_VERSION="2.63.2" && \
    ARCH=$(uname -m) && \
    case "$ARCH" in \
        x86_64) GH_ARCH="amd64" ;; \
        aarch64|arm64) GH_ARCH="arm64" ;; \
        *) echo "Unsupported architecture: $ARCH" && exit 1 ;; \
    esac && \
    curl -L "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_${GH_ARCH}.tar.gz" -o gh.tar.gz && \
    tar -xzf gh.tar.gz && \
    mv gh_${GH_VERSION}_linux_${GH_ARCH}/bin/gh /usr/local/bin/gh && \
    rm -rf gh.tar.gz gh_${GH_VERSION}_linux_${GH_ARCH}

# Install Claude CLI globally
RUN npm install -g @anthropic-ai/claude-code

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S automaker && \
    adduser -S automaker -u 1001

# Copy root package.json (needed for workspace resolution)
COPY --from=server-builder /app/package*.json ./

# Copy built libs (workspace packages are symlinked in node_modules)
COPY --from=server-builder /app/libs ./libs

# Copy built server
COPY --from=server-builder /app/apps/server/dist ./apps/server/dist
COPY --from=server-builder /app/apps/server/package*.json ./apps/server/

# Copy node_modules (includes symlinks to libs)
COPY --from=server-builder /app/node_modules ./node_modules

# Create data and projects directories
RUN mkdir -p /data /projects && chown automaker:automaker /data /projects

# Configure git for mounted volumes and authentication
# Use --system so it's not overwritten by mounted user .gitconfig
RUN git config --system --add safe.directory '*' && \
    # Use gh as credential helper (works with GH_TOKEN env var)
    git config --system credential.helper '!gh auth git-credential'

# Switch to non-root user
USER automaker

# Environment variables
ENV NODE_ENV=production
ENV PORT=3008
ENV DATA_DIR=/data

# Expose port
EXPOSE 3008

# Health check (using curl since it's already installed, more reliable than busybox wget)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3008/api/health || exit 1

# Start server
CMD ["node", "apps/server/dist/index.js"]

# =============================================================================
# UI BUILD STAGE
# =============================================================================
FROM base AS ui-builder

# Copy UI-specific package.json
COPY apps/ui/package*.json ./apps/ui/

# Install dependencies (--ignore-scripts to skip husky and build:packages in prepare script)
RUN npm ci --ignore-scripts

# Copy all source files
COPY libs ./libs
COPY apps/ui ./apps/ui

# Build packages in dependency order, then build UI
# VITE_SERVER_URL tells the UI where to find the API server
# Use ARG to allow overriding at build time: --build-arg VITE_SERVER_URL=http://api.example.com
ARG VITE_SERVER_URL=http://localhost:3008
ENV VITE_SKIP_ELECTRON=true
ENV VITE_SERVER_URL=${VITE_SERVER_URL}
RUN npm run build:packages && npm run build --workspace=apps/ui

# =============================================================================
# UI PRODUCTION STAGE
# =============================================================================
FROM nginx:alpine AS ui

# Copy built files
COPY --from=ui-builder /app/apps/ui/dist /usr/share/nginx/html

# Copy nginx config for SPA routing
COPY apps/ui/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
