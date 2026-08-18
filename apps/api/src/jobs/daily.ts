/**
 * Job quotidien — matérialiseur IDEMPOTENT (plan v1 « Job quotidien »).
 *
 * Le prédicat d'expiration est vérifié À L'ÉCRITURE par chaque transition de
 * l'API : ce job ne fait que MATÉRIALISER les états (EXPIRED, masquage) et
 * déclencher les effets de bord. Chaque candidat sélectionné transite ligne par
 * ligne en CAS (`updateMany` conditionnel unitaire) et l'effet de bord (email,
 * masquage) n'est déclenché que si `count === 1` : le job est relançable sans
 * double transition ni double email (cron + run manuel), avec en dernière ligne
 * de défense les idempotency keys Resend.
 *
 * Exécution : cron Scaleway → POST /internal/jobs/daily (header x-job-secret),
 * ou à la main : pnpm --filter @repo/api job:daily
 */
import {
  renderListingHiddenEmail,
  renderRequestExpiredEmail,
  renderRequestReminderEmail,
} from '@repo/emails'
import { getEnv } from '../env'
import { captureServerException, shutdownAnalytics } from '../lib/analytics'
import type { OutgoingEmail } from '../lib/email'
import { logger } from '../lib/logger'
import { getDb } from '../lib/prisma'
import { listingCardTitle, listingOwnerTitle } from '../services/listing-title'
import { type EmailRecipient, sendToRecipient } from '../services/notify'
import { REQUEST_EXPIRY_MS, REQUEST_REMINDER_AFTER_MS } from '../services/request-service'
import { purge } from './purge'

const DAY_MS = 24 * 60 * 60 * 1000
/** Comptes coquilles (accountType null, aucune session) purgés à 7 j (arbitrage 13). */
const SHELL_RETENTION_MS = 7 * DAY_MS

export interface DailyJobSummary {
  expired: number
  remindersSent: number
  shellsPurged: number
  listingsHidden: number
}

/**
 * Envoi tolérant aux pannes : un email qui échoue est loggé (sans PII) et ne
 * bloque ni la ligne suivante ni le job. Hors transaction par construction
 * (règle d'intégrité 4) — le CAS a déjà commité quand on envoie.
 */
async function sendQuiet(recipient: EmailRecipient, message: Omit<OutgoingEmail, 'to'>) {
  try {
    await sendToRecipient(recipient, message)
  } catch (error) {
    const err = error instanceof Error ? { name: error.name, message: error.message } : {}
    logger.error({ err }, 'job quotidien : échec envoi email')
  }
}

/** Données nécessaires aux emails d'expiration (les deux côtés) + à la décision de masquage. */
const EXPIRY_CANDIDATE_SELECT = {
  id: true,
  awaitingSide: true,
  lastActivityAt: true,
  requester: { select: { firstName: true, email: true, emailStatus: true } },
  listing: {
    select: {
      id: true,
      category: true,
      title: true,
      capacity: true,
      lastHostActivityAt: true,
      beds: { select: { type: true, count: true, capacityEach: true } },
      owner: { select: { firstName: true, email: true, emailStatus: true } },
    },
  },
} as const

type ExpiryCandidate = {
  id: string
  awaitingSide: 'HOST' | 'REQUESTER'
  lastActivityAt: Date
  requester: { firstName: string | null; email: string; emailStatus: EmailRecipient['emailStatus'] }
  listing: {
    id: string
    category: 'PRIVATE' | 'HOTEL' | 'COLLECTIVE' | 'SCOUT_BASE'
    title: string | null
    capacity: number
    lastHostActivityAt: Date
    beds: {
      type: 'PRIVATE_ROOM' | 'COUCH' | 'FLOOR_BED' | 'TENT_SPOT'
      count: number
      capacityEach: number
    }[]
    owner: { firstName: string | null; email: string; emailStatus: EmailRecipient['emailStatus'] }
  }
}

function requesterTitle(listing: ExpiryCandidate['listing']): string {
  return listingCardTitle(listing)
}

function hostTitle(listing: ExpiryCandidate['listing']): string {
  return listingOwnerTitle({
    category: listing.category,
    title: listing.title,
    beds: listing.beds,
    ownerFirstName: listing.owner.firstName,
  })
}

/** Emails d'expiration aux DEUX côtés — au demandeur : quota libéré ; à l'hébergeur : alerte. */
async function notifyExpired(candidate: ExpiryCandidate, appOrigin: string): Promise<void> {
  const toRequester = await renderRequestExpiredEmail({
    toFirstName: candidate.requester.firstName ?? '',
    listingTitle: requesterTitle(candidate.listing),
    forRequester: true,
    actionUrl: `${appOrigin}/recherche`,
  })
  await sendQuiet(candidate.requester, {
    ...toRequester,
    idempotencyKey: `expired/${candidate.id}`,
  })

  const toHost = await renderRequestExpiredEmail({
    toFirstName: candidate.listing.owner.firstName ?? '',
    listingTitle: hostTitle(candidate.listing),
    forRequester: false,
    actionUrl: `${appOrigin}/hebergeur/logements`,
  })
  await sendQuiet(candidate.listing.owner, {
    ...toHost,
    idempotencyKey: `expired-host/${candidate.id}`,
  })
}

export async function runDailyJob(now = new Date()): Promise<DailyJobSummary> {
  const db = getDb()
  const appOrigin = getEnv().APP_ORIGIN
  const staleCutoff = new Date(now.getTime() - REQUEST_EXPIRY_MS)

  let expired = 0
  let listingsHidden = 0

  // (1) EXPIRATION — PENDING sans activité depuis 7 j → EXPIRED, emails des deux côtés.
  const candidates = await db.lodgingRequest.findMany({
    where: { status: 'PENDING', lastActivityAt: { lt: staleCutoff } },
    select: EXPIRY_CANDIDATE_SELECT,
  })
  for (const candidate of candidates) {
    // CAS unitaire : le prédicat est RE-vérifié à l'écriture — un message arrivé
    // entre le SELECT et l'UPDATE (lastActivityAt rafraîchie) annule la transition.
    const cas = await db.lodgingRequest.updateMany({
      where: { id: candidate.id, status: 'PENDING', lastActivityAt: { lt: staleCutoff } },
      data: { status: 'EXPIRED' },
    })
    if (cas.count === 0) continue
    expired += 1
    await notifyExpired(candidate, appOrigin)

    // Masquage du logement : UNIQUEMENT si l'expiration attendait l'hébergeur ET que
    // celui-ci est inactif partout (anti-faux-positif : un hébergeur actif par
    // ailleurs n'est pas masqué). Déclenché par CETTE transition seulement — jamais
    // par re-scan, sinon une réactivation serait re-masquée le lendemain.
    if (candidate.awaitingSide !== 'HOST') continue
    if (candidate.listing.lastHostActivityAt >= staleCutoff) continue

    const hidden = await db.listing.updateMany({
      where: { id: candidate.listing.id, hiddenAt: null },
      data: { hiddenAt: now },
    })
    if (hidden.count === 0) continue
    listingsHidden += 1

    const hiddenEmail = await renderListingHiddenEmail({
      hostFirstName: candidate.listing.owner.firstName ?? '',
      listingTitle: hostTitle(candidate.listing),
      actionUrl: `${appOrigin}/hebergeur/logements`,
    })
    await sendQuiet(candidate.listing.owner, {
      ...hiddenEmail,
      idempotencyKey: `listing-hidden/${candidate.listing.id}`,
    })

    // Expiration groupée : l'hébergeur est réputé injoignable — on ne fait pas
    // attendre chaque demandeur son propre compteur de 7 jours.
    const sisters = await db.lodgingRequest.findMany({
      where: { listingId: candidate.listing.id, status: 'PENDING', awaitingSide: 'HOST' },
      select: EXPIRY_CANDIDATE_SELECT,
    })
    for (const sister of sisters) {
      // Pas de prédicat d'ancienneté ici (expiration groupée assumée), mais un CAS
      // quand même : une sœur traitée entre-temps n'est ni re-transitée ni re-notifiée.
      const sisterCas = await db.lodgingRequest.updateMany({
        where: { id: sister.id, status: 'PENDING', awaitingSide: 'HOST' },
        data: { status: 'EXPIRED' },
      })
      if (sisterCas.count === 0) continue
      expired += 1
      await notifyExpired(sister, appOrigin)
    }
  }

  // (2) RELANCES quotidiennes (arbitrage 15) — au plus une par 24 h, au côté attendu.
  // Sélection APRÈS l'étape 1 : une demande tout juste expirée n'est plus PENDING.
  let remindersSent = 0
  const reminderCutoff = new Date(now.getTime() - REQUEST_REMINDER_AFTER_MS)
  const dayKey = now.toISOString().slice(0, 10)
  const dueReminders = await db.lodgingRequest.findMany({
    where: {
      status: 'PENDING',
      lastActivityAt: { lt: reminderCutoff },
      OR: [{ lastReminderAt: null }, { lastReminderAt: { lt: reminderCutoff } }],
    },
    select: EXPIRY_CANDIDATE_SELECT,
  })
  for (const due of dueReminders) {
    // CAS : poser lastReminderAt est LA transition — une relance déjà posée il y a
    // moins de 24 h (autre run, autre instance) fait échouer le count.
    const cas = await db.lodgingRequest.updateMany({
      where: {
        id: due.id,
        status: 'PENDING',
        OR: [{ lastReminderAt: null }, { lastReminderAt: { lt: reminderCutoff } }],
      },
      data: { lastReminderAt: now },
    })
    if (cas.count === 0) continue
    remindersSent += 1

    const daysLeft = Math.max(
      0,
      Math.ceil((due.lastActivityAt.getTime() + REQUEST_EXPIRY_MS - now.getTime()) / DAY_MS),
    )
    const awaitingHost = due.awaitingSide === 'HOST'
    const rendered = await renderRequestReminderEmail({
      toFirstName: (awaitingHost ? due.listing.owner.firstName : due.requester.firstName) ?? '',
      listingTitle: awaitingHost ? hostTitle(due.listing) : requesterTitle(due.listing),
      daysLeft,
      actionUrl: `${appOrigin}${awaitingHost ? '/hebergeur/demandes' : '/mes-demandes'}`,
    })
    await sendQuiet(awaitingHost ? due.listing.owner : due.requester, {
      ...rendered,
      idempotencyKey: `reminder/${due.id}/${dayKey}`,
    })
  }

  // (3) PURGE DES COQUILLES (arbitrage 13) — magic link demandé mais onboarding jamais
  // fait ET aucune session (un clic sur le lien crée une session → conservé). La
  // suppression libère le slot emailHash ; cascade sur tokens/usages.
  // role=USER : une coquille promue admin (promoteAdmin) attend sa première
  // connexion et ne doit pas être purgée.
  const shells = await db.user.deleteMany({
    where: {
      role: 'USER',
      accountType: null,
      sessions: { none: {} },
      createdAt: { lt: new Date(now.getTime() - SHELL_RETENTION_MS) },
    },
  })

  // (4) RE-SYNC DES CAPACITÉS dénormalisées (auto-guérison, coût nul à cette échelle).
  // Écrit seulement en cas de dérive — un run sans dérive ne touche aucune ligne.
  const privateListings = await db.listing.findMany({
    where: { category: 'PRIVATE' },
    select: { id: true, capacity: true, beds: { select: { count: true, capacityEach: true } } },
  })
  for (const listing of privateListings) {
    const capacity = listing.beds.reduce((sum, bed) => sum + bed.count * bed.capacityEach, 0)
    if (capacity !== listing.capacity) {
      await db.listing.update({ where: { id: listing.id }, data: { capacity } })
    }
  }

  // (5) Purge de rétention existante (magic links / sessions / journaux d'usage).
  await purge(now)

  const summary: DailyJobSummary = {
    expired,
    remindersSent,
    shellsPurged: shells.count,
    listingsHidden,
  }
  // Résumé chiffré uniquement — JAMAIS de PII dans les logs (§7).
  logger.info(summary, 'job quotidien terminé')
  return summary
}

if (process.argv[1]?.endsWith('daily.ts') || process.argv[1]?.endsWith('daily.js')) {
  runDailyJob()
    .then(() => process.exit(0))
    .catch(async (error) => {
      console.error(error)
      // Le job tourne en processus éphémère (Serverless Job) : sans flush explicite,
      // l'exception batchée meurt avec le processus et n'atteint jamais PostHog.
      captureServerException(error instanceof Error ? error : new Error(String(error)), {
        path: 'job:daily',
      })
      await shutdownAnalytics().catch(() => {})
      process.exit(1)
    })
}
