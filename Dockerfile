FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ffmpeg \
    fonts-liberation \
    fonts-noto-color-emoji \
    fonts-dejavu-core \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# `npm install` (not `npm ci`) — same reason as alt-history:
# rspack native bindings (@rspack/binding-linux-x64-gnu) are platform-specific
# and `npm ci` from a Mac-generated lockfile skips them.
COPY package.json ./
RUN npm install --include=optional --no-audit --no-fund

COPY . .

ENV REMOTION_BROWSER_EXECUTABLE=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV REMOTION_CONCURRENCY=1
ENV STATE_DIR=/data/state
ENV OUTPUT_BASE=/app/output

CMD ["npm", "run", "daily"]
