# Plateforme hébergement — monorepo

Mise en relation pour l'hébergement des volontaires et participants d'un grand événement (v1 : venue du pape
Léon XIV en France, 25-28 septembre 2026 — Lourdes · Paris · Metz). Trois parcours :
volontaires et participants (recherche de logement, demandes), hébergeurs (offres de logements,
réponses), unités scoutes (jumelage, pure mise en relation). Admins : métriques + logements
institutionnels.

Les décisions techniques sont dans [CLAUDE.md](./CLAUDE.md) — le lire avant toute
modification. Le cadrage fonctionnel et la maquette de référence sont dans
[docs/design/](./docs/design/) (rapport écran par écran + maquette hi-fi).

**Stack** : pnpm workspaces + Turborepo · Node 22 · Hono + `@hono/zod-openapi` (spec 3.1) ·
Zod v4 · Prisma 6 + chiffrement champ (`prisma-field-encryption`) · PostgreSQL 16 ·
React + Vite + react-router + TanStack Query (RPC Hono typé, zéro codegen) ·
Vitest + Testcontainers · Biome · Terraform (Scaleway).

## Rebrander la plateforme (réutilisabilité)

Tout ce qui est propre à l'ÉVÉNEMENT vit dans **`packages/event-config/src/index.ts`** :
nom, dates, sites (avec coordonnées pour la distance), textes d'accueil, branches, logos.
Pour un autre événement : modifier ce fichier, remplacer les images de
`apps/web/src/assets/` (logos + signes), et ajuster les tokens visuels de
`apps/web/src/styles/tokens.css` si la charte change. La base stocke les sites en `String`
(slug) : changer la liste ne demande aucune migration.

## Démarrage local

Prérequis : Node 22, pnpm 10 (`corepack enable`), Docker.

```bash
pnpm install
pnpm setup:env          # génère les .env locaux avec des clés de dev fraîches
docker compose up -d db # PostgreSQL 16 sur localhost:5433 (base `heberge`)
pnpm db:migrate         # migrations (chiffrement actif dès la première)
pnpm db:seed            # fixtures de la maquette (comptes + logements + demandes + jumelage)
pnpm dev                # API http://127.0.0.1:3001 + SPA http://localhost:5173
```

Connexion en dev : saisir un email du seed sur http://localhost:5173 — l'email n'est pas
envoyé mais écrit dans `apps/api/.local/outbox/` (le magic link ne doit jamais apparaître
dans les logs). Ouvrir le lien qu'il contient pour créer la session. Un email inconnu crée
un compte « coquille » : l'écran Inscription propose alors de choisir son type de compte.

Comptes de démo (seed) :

| Email | Rôle |
|---|---|
| `marie.lefevre@exemple.fr` | Volontaire (3 demandes en cours, quota plein) |
| `claire@exemple.fr` | Hébergeur (logement 8 places, demandes reçues) |
| `1nancy@exemple.fr` | Unité scoute (annonce jumelage Metz, relations) |
| `admin@exemple.fr` | Administrateur (métriques, logements institutionnels) |

- Spec OpenAPI : http://127.0.0.1:3001/api/openapi.json (doc : `/api/docs`)
- Tests : `pnpm test` (unitaires) · `pnpm test:integration` (Testcontainers, Docker requis)
- Qualité : `pnpm lint` · `pnpm check-types` · `pnpm build`
- Job quotidien (expirations, relances, masquage, purges) :
  `pnpm --filter @repo/api job:daily` — en prod : Scaleway Serverless Job planifié
  (07:00 Europe/Paris), déclenchement manuel de secours via
  `POST /api/internal/jobs/daily` (header `x-job-secret`).

## Organisation

```
apps/api             Hono + Prisma — conteneur Scaleway (Dockerfile)
apps/web             SPA React/Vite — Object Storage + Edge Services
packages/db          schéma Prisma (annotations @pii/@encrypted), client chiffré, RGPD art. 17/20
packages/contracts   schémas Zod partagés (dépend de zod + @repo/event-config)
packages/event-config  configuration événement — LE point de rebranding
packages/emails      templates React Email (magic link + cycle de demande + jumelage)
packages/config      tsconfig partagés
docs/design/         maquette hi-fi + rapport d'analyse (spec UI) + tokens charte
infra/               Terraform Scaleway (fr-par) — voir infra/README.md
```

Règles de dépendances (§4 du CLAUDE.md) : `apps/*` → `packages/*`, jamais l'inverse ;
`apps/web` n'importe de `@repo/api` que le type `AppType`.

## Points de vigilance (résumé du CLAUDE.md)

- **Minimisation** : `select` Prisma explicite + `Schema.parse()` avant chaque `c.json()`.
  L'adresse complète d'un logement et les coordonnées ne sortent QUE sur une demande
  acceptée (ou une mise en relation jumelage acceptée).
- **Logs** : jamais `log: ['query']` en prod, jamais d'email/token/URL en log (pino redact).
- **`$queryRaw` interdit** sur les tables à champs chiffrés (bypasse l'extension).
  Seule exception : `SELECT pg_advisory_xact_lock(...)` (verrou par demandeur).
- **Magic link** : token multi-usage plafonné (décision assumée) — ne pas « corriger »
  vers l'usage unique sans discussion. Il crée le compte s'il n'existe pas (coquille).
- **Transitions d'état** : toujours en compare-and-swap (`updateMany` conditionnel +
  vérification du `count`), jamais de SELECT-puis-UPDATE ; emails APRÈS commit, avec
  idempotency key.
- **Fin de run** : suivre la procédure de purge de `infra/README.md` (les backups
  survivent au `terraform destroy`).
