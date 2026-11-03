FROM node:22.23.4-bookworm-slim
RUN corepack enable && corepack prepare pnpm@10.26.2 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json frontend/package.json
RUN pnpm install --frozen-lockfile --filter frontend
COPY frontend frontend
WORKDIR /app/frontend
EXPOSE 5173
CMD ["pnpm", "dev"]
