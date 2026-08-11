# Infra — Scaleway (fr-par)

Toutes les ressources sont en région `fr-par` : les PII ne quittent pas l'UE (§1).

## Ordre de mise en route (bootstrap, une seule fois)

> `app_domain` doit être un **sous-domaine** (ex. `heberge.exemple.org`) :
> l'activation Edge Services passe par un CNAME, impossible sur un apex chez un
> registrar externe.

1. **Bucket d'état** (hors Terraform, accès strictement restreint — l'état
   contient des valeurs de secrets) :
   ```sh
   scw object bucket create name=sgdf-heberge-terraform-state region=fr-par
   ```
   Puis exporter les credentials de l'opérateur (clé IAM admin, PAS celle de la CI) :
   ```sh
   export AWS_ACCESS_KEY_ID=<access-key> AWS_SECRET_ACCESS_KEY=<secret-key>
   terraform init
   ```
   ⚠️ Pas de verrou d'état : un seul opérateur Terraform à la fois.
2. **Premier apply ciblé** — les data sources de `secrets.tf` exigent des
   versions déjà posées, et le container une image déjà poussée ; on crée donc
   d'abord les coquilles de secrets et le registry :
   ```sh
   terraform apply \
     -target=scaleway_registry_namespace.main \
     -target=scaleway_secret.encryption_key \
     -target=scaleway_secret.hash_salt \
     -target=scaleway_secret.resend_api_key \
     -target=scaleway_secret.resend_webhook_secret \
     -target=scaleway_secret.job_secret
   ```
3. Renseigner les **valeurs** des secrets hors Terraform (IDs dans
   `terraform output`) :
   ```sh
   scw secret version create $(terraform output -raw secret_encryption_key_id)  data="k1.aesgcm256.$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64url"))')"
   scw secret version create $(terraform output -raw secret_hash_salt_id)       data="$(openssl rand -hex 32)"
   scw secret version create $(terraform output -raw secret_resend_api_key_id)  data="re_..."
   scw secret version create $(terraform output -raw secret_resend_webhook_secret_id) data="whsec_..."
   scw secret version create $(terraform output -raw secret_job_secret_id)      data="$(openssl rand -hex 32)"
   ```
4. Pousser une **image bootstrap** (le container ne démarre pas sans image ;
   depuis un Mac, forcer l'architecture) :
   ```sh
   docker build --platform linux/amd64 -f apps/api/Dockerfile -t $(terraform output -raw registry_endpoint)/api:latest .
   docker push $(terraform output -raw registry_endpoint)/api:latest
   ```
5. `terraform apply` complet — DB, container, job, bucket SPA, pipeline Edge
   Services, IAM CI. Si la création du certificat TLS managé échoue (CNAME pas
   encore posé), poser le CNAME (étape 6) puis relancer l'apply.
6. **CNAME** chez le registrar : `app_domain` → `terraform output -raw edge_cname_target`
   (`<pipeline-id>.svc.edge.scw.cloud`).
7. **Configurer GitHub** pour le workflow Deploy :
   - Secrets : `SCW_ACCESS_KEY` (= `terraform output -raw ci_access_key`),
     `SCW_SECRET_KEY` (= `terraform output -raw ci_secret_key`),
     `SCW_DEFAULT_PROJECT_ID`, `SCW_DEFAULT_ORGANIZATION_ID`.
   - Variables : `SCW_REGISTRY_ENDPOINT`, `SCW_CONTAINER_ID`,
     `SCW_JOB_DEFINITION_ID`, `SCW_EDGE_PIPELINE_ID`, `SCW_SPA_BUCKET`,
     `SCW_DATABASE_URL_SECRET_ID` (tous dans `terraform output`) et `APP_DOMAIN`.
8. DNS emails : SPF, DKIM, DMARC sur le sous-domaine expéditeur **avant** tout envoi (§8).
   Sous-domaines séparés recommandés : `auth.<domaine>` (transactionnel) et `news.<domaine>`.
9. Webhooks Resend → `https://<domaine>/api/webhooks/resend` (secret svix dans Secret Manager)

## Déployer (à chaque version)

Lancer le workflow **Deploy** (GitHub → Actions → Deploy → Run workflow). Il
build et pousse l'image `api:<sha>`, build la SPA, joue les migrations
(`DATABASE_URL` lue dans Secret Manager), bascule le container et le job
quotidien sur le nouveau SHA, publie la SPA (assets immutables, `index.html`
no-cache) et purge le cache Edge Services.

- **Migrations additives uniquement** (expand/contract) : elles tournent pendant
  que l'ancienne image sert le trafic. Un `DROP COLUMN` se fait en deux
  déploiements (code qui n'utilise plus la colonne, puis migration qui la retire).
- **Rollback** : relancer le workflow sur le commit précédent, ou à la main
  `scw container container update <id> registry-image=<registry>/api:<ancien-sha>`.
- Le premier smoke test suppose le CNAME actif ; avant ça, tester via
  `terraform output container_endpoint`.

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
