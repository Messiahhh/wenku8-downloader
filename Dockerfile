FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@9.15.9
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json tsconfig.eslint.json eslint.config.js .prettierrc.json ./
COPY src ./src
RUN pnpm check && pnpm prune --prod

FROM node:24-bookworm-slim
LABEL org.opencontainers.image.source="https://github.com/Messiahhh/wenku8-downloader"
WORKDIR /app
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
VOLUME ["/books"]
ENTRYPOINT ["node", "/app/dist/cli.js"]
