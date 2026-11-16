# Production image: one process serves the page and the API.
#
# The front end is built in the first stage, because Vite and the Vue toolchain
# are development dependencies; the runtime image only carries the server and the
# generated static files.

FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY vite.config.js ./
COPY server ./server
COPY web ./web
RUN npm run build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    SQLITE_PATH=/app/data/contactbook.db \
    STATIC_DIR=/app/server/public
WORKDIR /app

RUN useradd --create-home --uid 10001 contactbook

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=build /app/server ./server

RUN mkdir -p /app/data && chown -R contactbook:contactbook /app
USER contactbook

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server/src/server.js"]
