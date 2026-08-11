# API adhérents — image pour Scaleway Serverless Container (§3).
# Build depuis la RACINE du monorepo :
#   docker build -f apps/api/Dockerfile -t adherents-api .

FROM node:22-slim AS build
ENV PNPM_HOME=/pnpm PATH=$PNPM_HOME:$PATH
# openssl requis par les moteurs Prisma
RUN corepack enable && apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
# Client Prisma généré DANS le container : les moteurs correspondent à linux/openssl3
RUN pnpm --filter @repo/db db:generate
# Bundle esbuild : tout est embarqué sauf @prisma/client / .prisma (moteurs natifs)
RUN pnpm --filter @repo/api build
# On extrait uniquement ce dont le runtime a besoin
# Le vrai @prisma/client vit dans le store pnpm ; le client généré (.prisma) est
# son voisin : node_modules/.pnpm/@prisma+client@*/node_modules/{@prisma,.prisma}
RUN mkdir -p /app/node_modules \
  && STORE_NM=$(dirname "$(dirname "$(readlink -f packages/db/node_modules/@prisma/client)")") \
  && cp -r "$STORE_NM/@prisma" /app/node_modules/@prisma \
  && cp -r "$STORE_NM/.prisma" /app/node_modules/.prisma \
  && cp -r apps/api/dist /app/dist \
  # Le bundle esbuild est ESM (--format=esm) en extension .js : sans package.json
  # "type":"module" à la racine de /app, Node l'interpréterait en CJS → SyntaxError au boot.
  && printf '{"type":"module"}' > /app/package.json

FROM node:22-slim AS runtime
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app /app
USER node
EXPOSE 3001
# Secrets (DATABASE_URL, clés de chiffrement, RESEND_API_KEY…) injectés par
# Scaleway Secret Manager via les secret_environment_variables du container (§3).
CMD ["node", "dist/index.js"]
