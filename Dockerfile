# Multi-stage build: compile the React client with esbuild in one stage,
# install only the server's production dependencies in a second stage, then
# ship just the built client + server source — no client devDependencies
# (esbuild, etc.) end up in the final image.

# ---- stage 1: build the client ----
FROM node:22-slim AS client-build
WORKDIR /app/client
COPY client/package.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# ---- stage 2: production server image ----
FROM node:22-slim AS runtime
# node:sqlite has been stable since Node 22.5 — the base image tag above
# tracks the latest 22.x, which satisfies that; server/package.json also
# declares "engines": { "node": ">=22.5.0" } so this stays enforced even if
# the base image tag ever changes.
WORKDIR /app

COPY server/package.json ./server/package.json
RUN cd server && npm install --omit=dev

COPY server/ ./server/
COPY --from=client-build /app/client/dist ./client/dist

# Where the SQLite file lives — a volume gets mounted here in docker-compose
# so the paper-trading portfolio survives container restarts.
RUN mkdir -p /data
ENV QUANTPULSE_DB=/data/quantpulse.db
ENV PORT=4000
EXPOSE 4000

CMD ["node", "server/src/index.js"]
