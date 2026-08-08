# Infra — Scaleway (fr-par)

Toutes les ressources sont en région `fr-par` : les PII ne quittent pas l'UE (§1).

## Ordre de mise en route

1. `terraform init && terraform plan` (renseigner `app_domain`)
2. `terraform apply` — crée DB, registry, namespace container, buckets, secrets (coquilles)
3. Renseigner les **valeurs** des secrets hors Terraform (elles ne doivent pas
   transiter par l'état) :
   ```sh
   scw secret version create <encryption-key-id>  data="k1.aesgcm256.$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64url"))')"
   scw secret version create <hash-salt-id>       data="$(openssl rand -hex 32)"
   scw secret version create <resend-api-key-id>  data="re_..."
   ```
4. Build + push de l'image API :
   ```sh
   docker build -f apps/api/Dockerfile -t <registry>/api:v1 .
   docker push <registry>/api:v1
   ```
5. Migrations : `pnpm --filter @repo/db db:deploy` (depuis un poste autorisé ou un job)
6. Déployer la SPA : `pnpm --filter @repo/web build` puis sync `apps/web/dist` vers le bucket
7. Configurer le pipeline Edge Services : `/api/*` → container, le reste → bucket
   (**même domaine** pour les deux — requis par SameSite=Lax, §9)
8. DNS emails : SPF, DKIM, DMARC sur le sous-domaine expéditeur **avant** tout envoi (§8).
   Sous-domaines séparés recommandés : `auth.<domaine>` (transactionnel) et `news.<domaine>`.
9. Webhooks Resend → `https://<domaine>/api/webhooks/resend` (secret svix dans Secret Manager)

## Pendant le pic (campagne d'inscription)

- `db_is_ha = true` (bascule à chaud, facturation horaire) + monter `db_node_type`
- `container_min_scale = 1` minimum (zéro cold start sur le chemin d'auth)
- Vérifier : `max_scale × max_concurrency × connection_limit` < `max_connections` de la DB
- Charge de test AVANT le run réel (§11) — repli documenté : instance PRO2 (§3)

## ⚠️ Fin de run — purge (§12)

`terraform destroy` **ne purge pas** les snapshots et backups de la DB : les données
survivent des semaines. Procédure explicite :

1. Exporter ce qui doit l'être (obligations légales), chiffré
2. `terraform destroy`
3. **Lister et supprimer** les backups restants :
   ```sh
   scw rdb backup list instance-id=<id>
   scw rdb backup delete <backup-id>   # pour chacun
   scw rdb snapshot list ; scw rdb snapshot delete <id>
   ```
4. Supprimer les versions de secrets (`scw secret version delete`)
5. Purger les logs Cockpit restants (rétention courte : expiration ≤ 7 jours)
6. Consigner la date d'effacement au registre des traitements

## Resend (§8)

- Région UE si disponible sur le plan retenu + **DPA signé** — Resend voit emails
  et prénoms, il figure au registre des traitements comme sous-traitant.
- Plan de repli si Resend tombe pendant la campagne : bascule vers Scaleway
  Transactional Email (adapter `EmailDriver` dans `apps/api/src/lib/email.ts` —
  l'interface est prête) ou procédure manuelle.
