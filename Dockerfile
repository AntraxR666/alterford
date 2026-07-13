FROM node:22-bookworm-slim

WORKDIR /app

RUN npm install --global pnpm@11.5.3

COPY . .

RUN pnpm install --frozen-lockfile \
  && pnpm --filter @alterford/sdk build \
  && pnpm --filter @alterford/indexer build

CMD ["node", "packages/indexer/dist/cli.js"]
