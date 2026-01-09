# Automaker Multi-Stage Dockerfile
# Single Dockerfile for both server and UI builds
# Usage:
#   docker build --target server -t automaker-server .
#   docker build --target ui -t automaker-ui .
# Or use docker-compose which selects targets automatically

# =============================================================================
# BASE STAGE - Common setup for all builds (DRY: defined once, used by all)
# =============================================================================
FROM node:22-slim AS base

# Install build dependencies for native modules (node-pty)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

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
FROM node:22-slim AS server

# Build argument for tracking which commit this image was built from
ARG GIT_COMMIT_SHA=unknown
LABEL automaker.git.commit.sha="${GIT_COMMIT_SHA}"

# Install git, curl, bash (for terminal), gosu (for user switching), and GitHub CLI (pinned version, multi-arch)
RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl bash gosu ca-certificates openssh-client \
    && GH_VERSION="2.63.2" \
    && ARCH=$(uname -m) \
    && case "$ARCH" in \
        x86_64) GH_ARCH="amd64" ;; \
        aarch64|arm64) GH_ARCH="arm64" ;; \
        *) echo "Unsupported architecture: $ARCH" && exit 1 ;; \
    esac \
    && curl -L "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_${GH_ARCH}.tar.gz" -o gh.tar.gz \
    && tar -xzf gh.tar.gz \
    && mv gh_${GH_VERSION}_linux_${GH_ARCH}/bin/gh /usr/local/bin/gh \
    && rm -rf gh.tar.gz gh_${GH_VERSION}_linux_${GH_ARCH} \
    && rm -rf /var/lib/apt/lists/*

# Install Claude CLI globally (available to all users via npm global bin)
RUN npm install -g @anthropic-ai/claude-code

# Create non-root user with home directory BEFORE installing Cursor CLI
RUN groupadd -g 1001 automaker && \
    useradd -u 1001 -g automaker -m -d /home/automaker -s /bin/bash automaker && \
    mkdir -p /home/automaker/.local/bin && \
    mkdir -p /home/automaker/.cursor && \
    chown -R automaker:automaker /home/automaker && \
    chmod 700 /home/automaker/.cursor

# Install Cursor CLI as the automaker user
# Set HOME explicitly and install to /home/automaker/.local/bin/
USER automaker
ENV HOME=/home/automaker
RUN curl https://cursor.com/install -fsS | bash && \
    echo "=== Checking Cursor CLI installation ===" && \
    ls -la /home/automaker/.local/bin/ && \
    echo "=== PATH is: $PATH ===" && \
    (which cursor-agent && cursor-agent --version) || echo "cursor-agent installed (may need auth setup)"
USER root

# Add PATH to profile so it's available in all interactive shells (for login shells)
RUN mkdir -p /etc/profile.d && \
    echo 'export PATH="/home/automaker/.local/bin:$PATH"' > /etc/profile.d/cursor-cli.sh && \
    chmod +x /etc/profile.d/cursor-cli.sh

# Add to automaker's .bashrc for bash interactive shells
RUN echo 'export PATH="/home/automaker/.local/bin:$PATH"' >> /home/automaker/.bashrc && \
    chown automaker:automaker /home/automaker/.bashrc

# Also add to root's .bashrc since docker exec defaults to root
RUN echo 'export PATH="/home/automaker/.local/bin:$PATH"' >> /root/.bashrc

WORKDIR /app

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

# Copy entrypoint script for fixing permissions on mounted volumes
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Note: We stay as root here so entrypoint can fix permissions
# The entrypoint script will switch to automaker user before running the command

# Environment variables
ENV PORT=3008
ENV DATA_DIR=/data
ENV HOME=/home/automaker
# Add user's local bin to PATH for cursor-agent
ENV PATH="/home/automaker/.local/bin:${PATH}"

# Expose port
EXPOSE 3008

# Health check (using curl since it's already installed, more reliable than busybox wget)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3008/api/health || exit 1

# Use entrypoint to fix permissions before starting
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

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

# Build argument for tracking which commit this image was built from
ARG GIT_COMMIT_SHA=unknown
LABEL automaker.git.commit.sha="${GIT_COMMIT_SHA}"

# Copy built files
COPY --from=ui-builder /app/apps/ui/dist /usr/share/nginx/html

# Copy nginx config for SPA routing
COPY apps/ui/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
