# Build context must be the REPO ROOT (pnpm workspace):
#   docker build -f apps/worker/Dockerfile .
FROM node:22-slim

# ffmpeg for rendering. Montserrat is not packaged for Debian — bundle the
# .ttf in apps/worker/fonts/ (see README); DejaVu Sans Bold is the fallback
# the ASS subtitles degrade to via libass font matching.
# The lib*/fonts-* set beyond that is what chrome-headless-shell needs for the
# HyperFrames render engine (mirrors hyperframes' own render image).
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ffmpeg fonts-dejavu-core ca-certificates unzip \
    libgbm1 libnss3 libatk-bridge2.0-0 libdrm2 libxcomposite1 libxdamage1 \
    libxrandr2 libcups2 libasound2 libpangocairo-1.0-0 libxshmfence1 \
    fonts-liberation fontconfig \
  && rm -rf /var/lib/apt/lists/* \
  && fc-cache -f

# chrome-headless-shell for HyperFrames (deterministic BeginFrame capture).
# Pinned to the build hyperframes' own render images use.
RUN npx --yes @puppeteer/browsers install chrome-headless-shell@148.0.7778.167 \
      --path /opt/puppeteer \
  && CHS="$(find /opt/puppeteer/chrome-headless-shell -name chrome-headless-shell -type f | head -n1)" \
  && mkdir -p /opt/chrome \
  && ln -s "$CHS" /opt/chrome/chrome-headless-shell \
  && /opt/chrome/chrome-headless-shell --version

ENV HYPERFRAMES_CHROME_PATH=/opt/chrome/chrome-headless-shell
ENV PRODUCER_HEADLESS_SHELL_PATH=/opt/chrome/chrome-headless-shell
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CONTAINER=true

RUN corepack enable

WORKDIR /app

# Layer-cached install: manifests first.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/worker/package.json apps/worker/
RUN pnpm install --frozen-lockfile --filter @vd/worker...

# Sources (worker runs TS directly via tsx; no build step).
COPY packages/shared packages/shared
COPY apps/worker apps/worker

ENV NODE_ENV=production
CMD ["pnpm", "--filter", "@vd/worker", "start"]
