# API adhérents — monorepo

Gestion d'adhérents pour une association (~100 000 membres, run de 2 mois).
Les décisions techniques sont dans [CLAUDE.md](./CLAUDE.md) — le lire avant toute modification.

**Stack** : pnpm workspaces + Turborepo · Node 22 · Hono + `@hono/zod-openapi` (spec 3.1) ·
Zod v4 · Prisma 6 + chiffrement champ (`prisma-field-encryption`) · PostgreSQL 16 ·
React + Vite (RPC Hono typé, zéro codegen) · Vitest + Testcontainers · Biome · Terraform (Scaleway).

## Démarrage local

Prérequis : Node 22, pnpm 10 (`corepack enable`), Docker.

```bash
pnpm install
pnpm setup:env          # génère les .env locaux avec des clés de dev fraîches
docker compose up -d db # PostgreSQL 16 sur localhost:5433
pnpm db:migrate         # migrations (chiffrement actif dès la première)
pnpm db:seed            # 5 adhérents fictifs
pnpm dev                # API http://127.0.0.1:3001 + SPA http://localhost:5173
```

Connexion en dev : saisir un email du seed (ex. `alice.martin@example.org`) sur
http://localhost:5173 — l'email n'est pas envoyé mais écrit dans
`apps/api/.local/outbox/` (le magic link ne doit jamais apparaître dans les logs).
Ouvrir le lien qu'il contient pour créer la session.

- Spec OpenAPI : http://127.0.0.1:3001/api/openapi.json (doc : `/api/docs`)
- Tests : `pnpm test` (unitaires) · `pnpm test:integration` (Testcontainers, Docker requis)
- Qualité : `pnpm lint` · `pnpm check-types` · `pnpm build`

## Organisation

```
apps/api        Hono + Prisma — conteneur Scaleway (Dockerfile)
apps/web        SPA React/Vite — Object Storage + Edge Services
packages/db     schéma Prisma (annotations @pii/@encrypted), client chiffré, RGPD art. 17/20
packages/contracts  schémas Zod partagés (ne dépend que de zod)
packages/emails templates React Email (magic link)
packages/config tsconfig partagés
infra/          Terraform Scaleway (fr-par) — voir infra/README.md
```

Règles de dépendances (§4 du CLAUDE.md) : `apps/*` → `packages/*`, jamais l'inverse ;
`apps/web` n'importe de `@repo/api` que le type `AppType`.

## Points de vigilance (résumé du CLAUDE.md)

- **Minimisation** : `select` Prisma explicite + `Schema.parse()` avant chaque `c.json()`.
- **Logs** : jamais `log: ['query']` en prod, jamais d'email/token/URL en log (pino redact).
- **`$queryRaw` interdit** sur les tables à champs chiffrés (bypasse l'extension).
- **Magic link** : token multi-usage plafonné (décision assumée) — ne pas « corriger »
  vers l'usage unique sans discussion.
- **Fin de run** : suivre la procédure de purge de `infra/README.md` (les backups
  survivent au `terraform destroy`).
