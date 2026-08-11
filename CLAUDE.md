# Projet — Plateforme hébergement bénévoles (associatif)

> Ce fichier est la source de vérité TECHNIQUE pour Claude Code. Le lire avant toute tâche.
> La spec FONCTIONNELLE est `docs/design/rapport-maquette.md` (maquette écran par écran)
> et le plan d'implémentation v1 approuvé. Ordre d'autorité : maquette > cadrage > ce fichier
> pour le fonctionnel ; ce fichier reste souverain pour la technique.

## 1. Contexte

Plateforme de mise en relation pour l'hébergement des bénévoles d'un grand événement
(v1 : venue du pape Léon XIV en France, 25-28 sept. 2026 — sites Lourdes/Paris/Metz,
public potentiel ~100 000 personnes). Trois parcours : bénévole individuel (recherche +
demandes, max 3 en attente, expiration 7 j), hébergeur (offres à couchages typés, grille
accessibilité, accepter/question/refuser), unité scoute (jumelage : pure mise en relation,
échange de coordonnées). Admin : métriques par site + logements institutionnels
(hôtels → lien externe ; gymnases → flux de demande standard).
Durée de run prévue : **2 mois**, avec un pic de trafic prévisible.

**Réutilisabilité** : tout ce qui est propre à l'événement (nom, dates, sites, textes,
branches, logos) vit dans `packages/event-config`. Aucun texte d'événement en dur ailleurs.

Données traitées : **données personnelles** (nom, email, téléphone, adresse des logements,
besoins d'accessibilité — donnée sensible). Personnes concernées : **résidents UE**.
Tout doit rester hébergé en UE.

Contraintes conductrices, par ordre de priorité :
1. Conformité RGPD (souveraineté, minimisation, effacement)
2. Simplicité opérationnelle (petite équipe, run court)
3. Coût maîtrisé
4. Typage bout-en-bout front ↔ back

## 2. Stack retenue

| Couche | Choix | Note |
|---|---|---|
| Gestionnaire de paquets | pnpm workspaces | `packageManager` figé dans le root `package.json` |
| Orchestration | Turborepo | cache local suffisant, pas de remote cache |
| Runtime | Node.js 22 LTS | **pas** de runtime edge — voir §3 |
| Router HTTP | Hono | adaptateur `@hono/node-server` |
| OpenAPI | `@hono/zod-openapi` | spec 3.1 exposé sur `/openapi.json` |
| Validation | Zod v4 | source de vérité unique : types + runtime + OpenAPI |
| ORM | Prisma (mode librairie classique) | **pas** de driver adapter, **pas** d'Accelerate |
| DB | PostgreSQL 16 — Scaleway Managed Database, région `fr-par` | |
| Emails | Resend | voir §8 |
| Front | React + Vite (SPA) + react-router + TanStack Query | typage via Hono RPC, pas de codegen ; CSS vanilla + tokens charte SGDF (pas de Tailwind) |
| Tests | Vitest | + Testcontainers pour les tests d'intégration DB |
| Lint/format | Biome | un seul outil, config unique à la racine |
| IaC | Terraform, provider Scaleway | |

### Ce qu'on n'utilise PAS, et pourquoi

Ces décisions ont été prises après analyse. Ne pas les reverser sans discussion explicite.

- **Cloudflare Workers** — écarté. Le modèle isolate impose des contorsions (`PrismaClient` par requête, interdiction de réutiliser un objet I/O entre requêtes, `nodejs_compat`, limite de bundle, Hyperdrive). Et l'exécution edge fait transiter les PII hors UE, ce qui complique l'analyse RGPD.
- **Prisma Accelerate** — écarté. Les requêtes *et leurs résultats* transiteraient par un proxy tiers US, avec cache côté leur infra. Surface d'exposition maximale pour un gain nul ici.
- **Prisma Postgres (l'hébergement)** — écarté. Prisma Data Inc. est une société US ; ça ajouterait un sous-traitant extra-UE, un TIA, et une dépendance au Data Privacy Framework. On garde **uniquement l'ORM**, qui est du code local sans aucune surface RGPD.
- **Scaleway Serverless Functions (FaaS)** — écarté. Chaque instance ne traite **qu'une requête à la fois** : 200 requêtes concurrentes = 200 instances = 200 connexions PostgreSQL. Mode d'échec garanti pendant le pic.
- **tRPC / GraphQL** — écarté. On a besoin d'un spec OpenAPI consommable par des tiers.
- **openapi-typescript / openapi-fetch** — écarté *pour le front interne* : le monorepo permet le RPC Hono sans codegen. Le spec OpenAPI reste généré pour les consommateurs externes et la doc.

## 3. Cible de déploiement

**Option par défaut : Scaleway Serverless Container** (scale-to-zero, concurrence > 1 par instance).
**Option de repli si le pic est mal maîtrisé : Instance Scaleway PRO2** (coût fixe, zéro cold start).

La concurrence par instance doit être **explicitement configurée** (`> 1`), sinon on retombe sur le
problème de saturation des connexions décrit ci-dessus.

Ressources Scaleway :

- Managed Database PostgreSQL, région `fr-par`
  - Dev : `DB-DEV-S` (~11 €/mois, mono-nœud)
  - Prod pendant le run : monter en gamme + **activer la HA** (facturation horaire, changement de nœud à chaud)
- Serverless Container pour l'API
- Object Storage + Edge Services pour la SPA
- Container Registry pour les images
- Secret Manager pour les secrets (jamais de secret en variable d'env en clair)
- Cockpit pour logs et métriques — **avec rétention courte, voir §7**

## 4. Structure du monorepo

```
.
├── apps/
│   ├── api/                  # Hono + Prisma, déployé en container
│   │   ├── src/
│   │   │   ├── index.ts      # bootstrap serveur
│   │   │   ├── app.ts        # OpenAPIHono, export du type AppType pour le RPC
│   │   │   ├── routes/       # 1 fichier par ressource — TOUS branchés dans app.ts (chaîne unique)
│   │   │   ├── middleware/   # auth (requireAuth/requireAccountType/requireAdmin), rate-limit…
│   │   │   ├── services/     # logique métier, ne connaît pas HTTP
│   │   │   ├── jobs/         # purge.ts + daily.ts (CLI auto-exécutables, `now` injectable)
│   │   │   └── lib/
│   │   │       ├── prisma.ts # singleton PrismaClient
│   │   │       └── email.ts  # EmailDriver : resend | devfile | memory
│   │   └── Dockerfile
│   └── web/                  # SPA React + Vite
│       └── src/lib/api.ts    # client RPC Hono typé
├── packages/
│   ├── db/                   # schema.prisma, migrations, seed, client généré
│   ├── contracts/            # schémas Zod partagés API ↔ SPA
│   ├── event-config/         # config de l'événement — LE point de rebranding (Zod seul)
│   ├── emails/               # templates React Email (magic link + demandes + jumelage)
│   └── config/               # tsconfig partagés
├── docs/design/              # maquette hi-fi + rapport d'analyse (spec UI) + tokens charte
├── infra/                    # Terraform
├── turbo.json
├── pnpm-workspace.yaml
└── CLAUDE.md
```

Règles de dépendances :

- `apps/*` peuvent dépendre de `packages/*`. L'inverse est interdit.
- `packages/contracts` ne dépend que de Zod **et de `@repo/event-config`** (entorse assumée :
  la liste des sites vient de la config événement). `event-config` ne dépend que de Zod.
- `apps/web` **ne dépend jamais** de `packages/db` — le client Prisma ne doit pas finir dans le bundle front.
- Le type `AppType` est le seul export de `apps/api` consommé par `apps/web`, en `import type` uniquement.

## 5. Conventions API

### Prisma

Le `PrismaClient` est un **singleton au niveau module** (`packages/db` ou `apps/api/src/lib/prisma.ts`).
On tourne sur Node avec un vrai pool de connexions — c'est le mode nominal de Prisma.

> Note : sur Cloudflare Workers il aurait fallu l'instancier par requête. Ce n'est **pas** le cas ici.
> Si tu vois du code qui crée un `PrismaClient` dans un handler, c'est un bug.

Configurer explicitement le pool dans l'URL de connexion :
`?connection_limit=10&pool_timeout=20` — à ajuster selon le `max_connections` du nœud DB.

### Routes

Chaque route est déclarée avec `createRoute()` puis `app.openapi(route, handler)`.
Un schéma Zod par requête ET par réponse, systématiquement.

### Minimisation en sortie — POINT CRITIQUE

`@hono/zod-openapi` type les réponses **à la compilation** mais ne les filtre **pas au runtime**.
Un `c.json(user)` avec un `passwordHash` dans l'objet envoie le `passwordHash` sur le réseau.

Deux garde-fous obligatoires, à appliquer ensemble :

1. Toujours un `select` explicite côté Prisma. Jamais de `findMany()` nu sur une table contenant des PII.
2. Toujours `Schema.parse(data)` avant le `c.json()`.

### Erreurs

Jamais d'erreur Prisma brute renvoyée au client : elle expose la structure du schéma et parfois des
valeurs. Mapper `P2002`, `P2025`, etc. vers des codes d'erreur applicatifs dans un handler d'erreur
centralisé. Format de réponse d'erreur unique et déclaré dans le spec OpenAPI.

### Typage front

```ts
// apps/api/src/app.ts
export type AppType = typeof routes

// apps/web/src/lib/api.ts
import { hc } from 'hono/client'
import type { AppType } from '@repo/api'
export const api = hc<AppType>('/api')
```

Autocomplétion et vérification à la compilation, sans étape de génération.
Le `/openapi.json` reste exposé pour les consommateurs externes et Scalar/Swagger UI.

## 6. Modèle de données — exigences RGPD

- **`onDelete: Cascade` modélisé dès le départ.** L'effacement d'un compte (art. 17) doit être une
  seule opération, pas un script de 40 lignes écrit dans l'urgence.
- Prévoir une fonction `deleteMemberData(id)` testée, et une fonction `exportMemberData(id)` pour la
  portabilité (art. 20). Les écrire au début du projet, pas à la fin.
- Champs PII à identifier explicitement dans le schéma (commentaire `/// @pii`) pour pouvoir auditer.
- Durées de conservation : définir une politique et un job de purge, même pour un run de 2 mois.

### Chiffrement applicatif — DÉCIDÉ

Chiffrement au niveau champ via `prisma-field-encryption` (annotation `/// @encrypted` dans le schéma,
extension appliquée au `PrismaClient`).

| Champ | Chiffré | Raison |
|---|---|---|
| `User.email` | ✅ + blind index | sert de clé de login → besoin d'égalité exacte |
| `User.phone` | ✅ | transmis à l'hébergeur avec la demande / échangé en jumelage ; jamais recherché |
| `User.accessibilityNeeds` | ✅ | donnée sensible (JSON de slugs) ; le filtre recherche s'applique aux booléens du Listing, jamais à ce champ |
| `Listing.addressFull` | ✅ | révélée UNIQUEMENT à l'acceptation d'une demande ; la recherche se fait par `site` + `distanceKm` |
| `RequestMessage.body`, `JumelageContact.message` | ✅ | texte libre (contient téléphones/adresses) |
| `User.firstName/lastName`, `User.unitName` | ❌ **en clair** | tri/recherche + cartes jumelage publiques |
| `Listing.displayArea`, `Listing.distanceKm` | ❌ **en clair** | affichage carte (« Paris 12e ») et tri par distance — granularité quartier assumée |

Règles :

- **Blind index uniquement sur `email`** (annotation `/// @encrypted?mode=strict` + champ `emailHash`).
  Pas de blind index sur `phone` : un HMAC déterministe sur un numéro français est brute-forçable
  (espace de ~10⁸ valeurs).
- La clé HMAC du blind index est **distincte** de la clé de chiffrement. Deux secrets séparés.
- Clés au format `k1.aesgcm256.<base64>`, stockées dans Secret Manager. Prévoir la liste de clés de
  déchiffrement pour permettre la rotation.
- ⚠️ **`$queryRaw` bypasse l'extension.** Toute requête raw sur un champ chiffré retourne le blob.
  Interdire `$queryRaw` sur les tables contenant des champs chiffrés.
  **Seule exception admise** : `SELECT pg_advisory_xact_lock(hashtext(...))` — le verrou
  advisory par demandeur (sérialise quota et accepts concurrents) ne touche aucune table.
- Le chiffrement doit être en place **dès la première migration**. L'ajouter après coup impose une
  migration de données sur l'ensemble de la table.

Périmètre de protection : couvre le dump logique, la fuite de backup, l'accès DB direct.
**Ne couvre pas** une compromission applicative — l'API détient les clés. Le rate limiting et la
non-journalisation des PII restent les défenses de premier rang.

## 7. Logs et observabilité — POINT CRITIQUE

**Ne jamais activer `new PrismaClient({ log: ['query'] })` en production.** Le log de requêtes écrit
les paramètres liés en clair — donc emails et téléphones dans Cockpit, puis dans tout ce qui consomme
ces logs. C'est de très loin la fuite de PII la plus fréquente sur ce type de stack.

- Logs structurés JSON (pino), avec une **liste de champs redactés** configurée en dur.
- Ne jamais logger un body de requête complet.
- Rétention Cockpit courte et explicite : les logs sont une copie des PII, soumise aux mêmes règles.
- Les identifiants en logs sont des IDs, jamais des emails.

## 8. Emails — Resend

> ⚠️ **Chemin critique.** L'authentification repose sur le magic link (§9). L'email n'est pas un
> confort, c'est le seul moyen de se connecter. Traiter cette section avec le niveau d'exigence d'un
> composant d'auth, pas d'un système de notification.

- SDK `resend` côté API, templates dans `packages/emails` avec React Email.
- **Vérifier la configuration de région** : Resend est une société US. Utiliser leur région UE si
  disponible sur le plan retenu, et **signer le DPA**. Resend est un sous-traitant à part entière —
  il voit les emails et les noms — donc il doit figurer au registre des traitements.
- Clé API dans Secret Manager, jamais en clair, jamais committée.
- Configurer SPF, DKIM et DMARC sur le domaine expéditeur avant tout envoi de masse. Sur 100 000
  destinataires, une mauvaise config = domaine blacklisté dès la première campagne.
- Utiliser les **idempotency keys** de Resend sur les envois transactionnels pour éviter les doublons
  en cas de retry.
- Webhooks Resend (bounces, complaints) : les traiter et marquer les adresses invalides en base.
  Continuer à envoyer sur des adresses qui bouncent dégrade la réputation d'envoi.
- Pour les envois de masse : passer par une file (NATS / Scaleway Queues) plutôt que par une boucle
  dans un handler HTTP.

Spécifique au magic link :

- **Séparer les flux transactionnel et marketing.** Idéalement deux sous-domaines expéditeurs
  (`auth.<domaine>` et `news.<domaine>`). Une campagne qui génère des plaintes ne doit pas dégrader
  la délivrabilité des emails de connexion.
- Les mails de connexion sont envoyés **en synchrone**, jamais via la file de masse : pas de risque
  de se retrouver derrière 100 000 messages en attente.
- Monitorer la latence d'envoi et le taux d'échec. Une alerte sur le taux d'erreur Resend est une
  alerte de disponibilité de l'authentification.
- Prévoir un **plan de repli** documenté si Resend est indisponible pendant la campagne
  d'inscription (bascule vers Scaleway Transactional Email en secours, ou procédure manuelle).
- Ne jamais logger le contenu ni l'URL du magic link. Un lien en clair dans Cockpit est un
  contournement complet de l'authentification.

## 9. Sécurité

- Rate limiting sur les endpoints publics, en particulier ceux qui prennent un email en entrée
  (une route de lookup non limitée = un oracle d'énumération d'adhérents).
- CORS restreint à l'origine de la SPA.
- Headers de sécurité via le middleware `secureHeaders` de Hono.
- Pas de secret dans le code, dans les variables d'env en clair, ni dans les logs.

### Authentification — DÉCIDÉ : magic link + session httpOnly

Pas de mot de passe. L'utilisateur saisit son email, reçoit un lien de connexion, et obtient une
session longue.

**Bibliothèque** : Better Auth (adaptateur Prisma + intégration Hono, plugin magic link) ou
implémentation manuelle (~200 lignes). Trancher tôt, pas en cours de route.

#### Magic link

**Le lien crée le compte** (maquette) : un email inconnu crée un compte « coquille »
(`accountType` null), le type est choisi à la première connexion. Conséquences :
l'anti-énumération devient triviale (tout email « existe ») ; en contrepartie, un throttle
d'émission par email est ADOSSÉ À LA BASE (≥ 3 tokens/15 min → skip silencieux,
cross-instance) et AUCUN envoi ne part vers une adresse `BOUNCED`/`COMPLAINED` — la
réputation d'envoi est la disponibilité de l'authentification. Les coquilles jamais
onboardées et sans session sont purgées à 7 j par le job quotidien.
Le wording utilisateur dit « valable 10 minutes » (le texte « 30 minutes, un seul usage »
de la maquette était erroné et a été corrigé — voir décision ci-dessous).

**Décision assumée : token multi-usage plafonné, pas usage unique.**
Rationnel : un token à usage unique est brûlé par les scanners d'email d'entreprise (Outlook Safe
Links, antivirus, passerelles) qui font un GET sur toutes les URL d'un message, *avant* que
l'utilisateur ne clique. La parade classique — une page de confirmation intermédiaire avec un POST —
ajoute un clic sur le flux de login, ce qui génère de l'abandon sur une population associative de
100 000 personnes peu technophile. On accepte donc un token rejouable sur une fenêtre courte, en
compensant par les mitigations ci-dessous. **Ne pas revenir à l'usage unique sans discussion.**

- Token : 32 octets aléatoires cryptographiques. **Stocker un SHA-256 en base, jamais le token brut.**
- TTL : **10 minutes**. Assez pour absorber la latence de délivrance (file Resend + antispam
  destinataire, régulièrement 1 à 3 min), assez court pour limiter la fenêtre de rejeu.
  Ne pas descendre à 5 min : ça génère des liens expirés et du support.
- **Plafond de 3 à 5 utilisations** par token, pas d'illimité. Absorbe les scanners et les
  doubles-clics sans laisser un lien indéfiniment rejouable.
- **Invalidation de tous les tokens précédents** du même email à chaque nouvelle demande de lien.
- ✅ **Redirection 302 immédiate** vers une URL propre après avoir posé le cookie.
  **C'est la mitigation la plus importante** : le token sort de la barre d'adresse, de l'historique
  et de l'historique synchronisé entre appareils.
- ✅ **`Referrer-Policy: no-referrer`** sur la page de callback, pour éviter la fuite du token dans
  le header `Referer` vers un tiers.
- ✅ **Logger chaque utilisation** du token avec IP et user-agent. Deux IP distinctes sur un même
  token est un signal anormal à surveiller — ça restaure une partie de la détection qu'on perd en
  abandonnant l'usage unique. **Ne jamais logger le token lui-même.**
- **Anti-énumération** : la réponse à la demande de lien est **strictement identique** que l'email
  existe ou non (même corps, même code, même temps de réponse approximatif). Sinon l'endpoint devient
  un oracle d'appartenance à l'association — ce qui est en soi une donnée personnelle.
- **Rate limiting indispensable**, à deux niveaux : par email et par IP. Sans ça, l'endpoint est un
  moyen gratuit d'envoyer des mails à des tiers depuis notre domaine (abus + réputation d'envoi).
- Le lookup se fait sur `emailHash` (blind index), voir §6.
- Cross-device : demander sur mobile et ouvrir sur desktop est un usage courant. **Ne pas lier le
  token à l'IP ou au user-agent**, ça casserait ce cas.

> ⚠️ **Risque résiduel accepté et connu** : un utilisateur qui transfère son email de connexion à un
> tiers dans la fenêtre de 10 min transfère littéralement l'accès à son compte. Le formuler
> explicitement dans le texte du mail (« ne transférez pas ce message »).
>
> ⚠️ Un GET qui crée une session viole la sémantique HTTP (une méthode sûre ne doit pas avoir d'effet
> de bord). Conséquence possible : prefetch navigateur, et unfurling si un lien est collé dans Slack
> ou WhatsApp. Le 302 vers une URL propre limite les dégâts — mais si des comportements de connexion
> inexpliqués apparaissent, chercher de ce côté en premier.

#### Session

- **Session en base**, pas de JWT stateless — la révocation est nécessaire (déconnexion, suppression
  de compte au titre de l'art. 17).
- Token de session : 32 octets aléatoires, **SHA-256 stocké en base**.
- Expiration **glissante à 90 jours** d'inactivité, avec **plafond absolu à 6 mois**.
  Ne rafraîchir la date en base qu'une fois par 24 h maximum, sinon écriture à chaque requête.
- Cookie : `httpOnly`, `Secure`, `SameSite=Lax`, `Max-Age` explicite (pas de cookie de session, qui
  meurt à la fermeture du navigateur).
- Safari/ITP plafonne à 7 jours les cookies posés en JavaScript, **mais pas ceux posés par le serveur
  en `Set-Cookie`**. C'est précisément pourquoi on est en httpOnly côté serveur.

#### ⚠️ Contrainte d'infrastructure induite

`SameSite=Lax` exige que la SPA et l'API soient sur le **même site enregistrable**.
La SPA servie depuis Object Storage et l'API depuis le container **doivent** être exposées sur le
même domaine, avec `/api` routé vers le container via Edge Services.
**À acter au moment du Terraform**, pas après : sinon on bascule en `SameSite=None`, plus faible et
bloqué par certains navigateurs.

#### Conséquence sur la criticité des emails

L'email n'est plus un canal de notification, c'est **le mécanisme d'authentification**. Une panne
Resend ou un problème de délivrabilité = plus personne ne peut se connecter. Voir §8.

## 10. Tests

- Unitaires sur `services/` (pas de DB).
- Intégration sur les routes avec une vraie Postgres via Testcontainers — pas de mock Prisma, qui
  ne teste rien d'utile.
- **Un test dédié qui vérifie qu'aucune réponse d'API ne contient de champ PII non déclaré.** C'est
  le filet de sécurité sur la minimisation.
- Un test sur `deleteMemberData` qui vérifie qu'il ne reste aucune ligne orpheline.

Tests critiques à écrire **dès le premier jour** :

- **Chiffrement ↔ auth** : vérifier que le lookup par email de la couche d'auth passe bien par le
  blind index. C'est le point d'intégration le plus fragile de la stack, et il casse silencieusement.
- Vérifier en base (requête SQL brute, hors extension Prisma) que `email` et `phone` sont bien
  stockés chiffrés et que `firstName`/`lastName` sont en clair.
- Magic link : expiration à 10 min, plafond d'utilisations respecté, invalidation des tokens
  précédents lors d'une nouvelle demande, redirection 302 vers une URL sans token, réponse identique
  pour un email inexistant.
- Session : expiration glissante, plafond absolu, révocation effective à la suppression de compte.

## 11. Ordre de travail suggéré

1. Squelette monorepo (pnpm, Turbo, Biome, tsconfig partagés)
2. `packages/db` : schéma Prisma, migration initiale, seed
3. `packages/contracts` : schémas Zod
4. `apps/api` : bootstrap Hono, middleware, handler d'erreur, une route de bout en bout
5. Vérifier que `/openapi.json` est correct et que le RPC type bien côté front
6. `apps/web` : squelette SPA + client RPC
7. Emails Resend + webhooks
8. Terraform + CI/CD
9. Charge de test sur le pic attendu **avant** le run réel

## 12. Points tranchés et règles d'intégrité (plan v1 approuvé)

Tranchés :

- **Implémentation manuelle** du magic link (pas Better Auth) — faite, testée.
- **Transitions d'état : compare-and-swap OBLIGATOIRE.** Toute transition = `updateMany`
  conditionnel + vérification du `count` (0 → 409), le WHERE inclut le prédicat
  d'expiration (`lastActivityAt ≥ now − 7 j` pour les demandes). Jamais de
  SELECT-puis-UPDATE. Verrou advisory par demandeur (`requester:{id}`) autour du quota et
  de l'acceptation. Retry-once sur P2034. Emails APRÈS commit, avec idempotency key —
  jamais d'envoi dans une `$transaction`.
- **Le job quotidien est un matérialiseur idempotent** (transitions ligne à ligne en CAS,
  effets de bord seulement si `count === 1`) : expiration 7 j, masquage des logements
  d'hébergeurs inactifs (condition `lastHostActivityAt` — anti-faux-positif), relances
  1/24 h, purge des coquilles à 7 j, re-sync des capacités, purge tokens/sessions.
  En prod : Scaleway Serverless Job (`node dist/jobs/daily.js`, 07:00 Europe/Paris) ;
  secours manuel `POST /api/internal/jobs/daily` (header `x-job-secret`).
- **Suppression de compte/logement : annuler-puis-notifier avant d'effacer.** Les cascades
  DB sont le filet, pas le chemin nominal (un hébergeur qui part ne fait pas disparaître
  silencieusement l'hébergement de quelqu'un).
- HA de la DB : activée pour la fenêtre de pic (facturation horaire, à la mise en prod).
- Sous-domaines expéditeurs séparés auth/marketing : toujours recommandé (aucun envoi
  marketing en v1).

Restent ouverts :

- Fin de run : la destruction de l'instance DB **ne purge pas les snapshots et backups**.
  Procédure : à J+30 après l'événement, purge applicative complète (logements, demandes,
  messages, annonces, contacts, comptes), puis `terraform destroy`, puis purge explicite
  des snapshots/backups DB, des versions de secrets et des logs Cockpit
  (voir `infra/README.md`).
- ~~Edge Services~~ — TRANCHÉ : le pipeline complet (routage `/api` même domaine — condition
  du SameSite=Lax) est dans `infra/frontend.tf`. Reste à la mise en prod : le CNAME chez le
  registrar (`app_domain` = sous-domaine obligatoire) et le déclenchement du workflow Deploy
  (`.github/workflows/deploy.yml`) — voir `infra/README.md`.
