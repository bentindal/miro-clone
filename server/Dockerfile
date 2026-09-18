# Sync server for the whiteboard. Build from the repository root:
#   docker build -f server/Dockerfile -t whiteboard-server .
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json server/
RUN pnpm install --frozen-lockfile --filter whiteboard-server...
COPY server server
RUN pnpm --filter whiteboard-server build

FROM node:22-alpine
RUN corepack enable
WORKDIR /app
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json server/
RUN pnpm install --frozen-lockfile --prod --filter whiteboard-server...
COPY --from=build /app/server/dist server/dist
EXPOSE 8787
CMD ["node", "server/dist/index.js"]
