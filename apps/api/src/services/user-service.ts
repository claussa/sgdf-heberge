import {
  ACCESS_CRITERIA,
  type AccessCriterion,
  type Me,
  type OnboardingInput,
  type ProfileUpdateInput,
} from '@repo/contracts'
import { type Db, deleteUserData, normalizeEmail } from '@repo/db'
import { renderRequestCancelledEmail } from '@repo/emails'
import { getEnv } from '../env'
import { AppError } from '../errors'
import type { SessionUser } from './auth-service'
import { listingOwnerTitle } from './listing-title'
import { sendToRecipientAsync } from './notify'

/** JSON chiffré en base → slugs valides uniquement (robustesse aux données legacy) */
export function parseAccessibilityNeeds(json: string | null): AccessCriterion[] {
  if (!json) return []
  try {
    const parsed: unknown = JSON.parse(json)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((v): v is AccessCriterion =>
      (ACCESS_CRITERIA as readonly string[]).includes(v as string),
    )
  } catch {
    return []
  }
}

export function toMe(
  user: SessionUser,
  extras: { hasListings: boolean; hasActiveAd: boolean },
): Me {
  return {
    id: user.id,
    accountType: user.accountType,
    role: user.role,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    groupSize: user.groupSize,
    accessibilityNeeds: parseAccessibilityNeeds(user.accessibilityNeeds),
    unitName: user.unitName,
    unitBranch: user.unitBranch,
    onboardedAt: user.onboardedAt ? user.onboardedAt.toISOString() : null,
    hasListings: extras.hasListings,
    seeksAccommodation: user.seekerOnboardedAt !== null,
    hostTourStatus: user.hostTourStatus,
    seekerTourStatus: user.seekerTourStatus,
    hasActiveAd: extras.hasActiveAd,
    createdAt: user.createdAt.toISOString(),
  }
}

export async function getMe(db: Db, user: SessionUser): Promise<Me> {
  const [listings, activeAds] = await Promise.all([
    db.listing.count({ where: { ownerId: user.id } }),
    db.jumelageAd.count({ where: { userId: user.id, status: 'ACTIVE' } }),
  ])
  return toMe(user, { hasListings: listings > 0, hasActiveAd: activeAds > 0 })
}

/**
 * Onboarding : pose accountType UNE seule fois (écran « Je m'inscris comme… »).
 * Rejouer le même type met simplement le profil à jour ; changer de type est refusé
 * (les parcours individuel et unité sont cloisonnés).
 */
export async function completeOnboarding(
  db: Db,
  user: SessionUser,
  input: OnboardingInput,
  now = new Date(),
): Promise<void> {
  if (user.accountType && user.accountType !== input.accountType) {
    throw new AppError('CONFLICT', 'Le type de compte est définitif')
  }
  const data =
    input.accountType === 'INDIVIDUAL'
      ? {
          accountType: input.accountType,
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
          groupSize: input.groupSize ?? null,
          accessibilityNeeds: input.accessibilityNeeds?.length
            ? JSON.stringify(input.accessibilityNeeds)
            : null,
          // Interrupteur à sens unique : le parcours hébergeur ne l'envoie pas
          ...(input.seeksAccommodation && !user.seekerOnboardedAt
            ? { seekerOnboardedAt: now }
            : {}),
        }
      : {
          accountType: input.accountType,
          unitName: input.unitName,
          unitBranch: input.unitBranch,
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
        }
  await db.user.update({
    where: { id: user.id },
    data: { ...data, onboardedAt: user.onboardedAt ?? now },
  })
}

/** Mise à jour du profil — seuls les champs du type de compte sont pris en compte. */
export async function updateProfile(
  db: Db,
  user: SessionUser,
  input: ProfileUpdateInput,
): Promise<void> {
  if (!user.accountType) {
    throw new AppError('CONFLICT', "Termine d'abord ton inscription")
  }
  const data: Record<string, unknown> = {}
  if (input.firstName !== undefined) data.firstName = input.firstName
  if (input.lastName !== undefined) data.lastName = input.lastName
  if (input.phone !== undefined) data.phone = input.phone
  if (user.accountType === 'INDIVIDUAL') {
    if (input.seeksAccommodation && !user.seekerOnboardedAt) data.seekerOnboardedAt = new Date()
    if (input.hostTourStatus !== undefined) data.hostTourStatus = input.hostTourStatus
    if (input.seekerTourStatus !== undefined) data.seekerTourStatus = input.seekerTourStatus
    if (input.groupSize !== undefined) data.groupSize = input.groupSize
    if (input.accessibilityNeeds !== undefined) {
      data.accessibilityNeeds = input.accessibilityNeeds.length
        ? JSON.stringify(input.accessibilityNeeds)
        : null
    }
  } else {
    if (input.unitName !== undefined) data.unitName = input.unitName
    if (input.unitBranch !== undefined) data.unitBranch = input.unitBranch
  }
  if (Object.keys(data).length === 0) return
  await db.user.update({ where: { id: user.id }, data })
}

/** Marquage bounce/complaint via webhook Resend (§8). Lookup par blind index. */
export async function markEmailStatus(
  db: Db,
  emailInput: string,
  status: 'BOUNCED' | 'COMPLAINED',
): Promise<void> {
  const email = normalizeEmail(emailInput)
  await db.user.updateMany({ where: { email }, data: { emailStatus: status } })
}

/**
 * Suppression de compte (art. 17) — la cascade DB est le FILET, pas le chemin nominal :
 * on annule d'abord les demandes ACCEPTED des deux côtés et on prévient les personnes
 * concernées (un hébergeur qui part ne doit pas faire disparaître silencieusement
 * l'hébergement de quelqu'un à J−3), PUIS on supprime.
 */
export async function deleteUserAccount(db: Db, userId: string): Promise<void> {
  const appOrigin = getEnv().APP_ORIGIN

  // Demandes ACCEPTED émises par le compte (l'hébergeur de chaque demande est prévenu)
  const sentAccepted = await db.lodgingRequest.findMany({
    where: { requesterId: userId, status: 'ACCEPTED' },
    select: {
      id: true,
      listing: {
        select: {
          category: true,
          title: true,
          beds: { select: { type: true, count: true, capacityEach: true } },
          owner: {
            select: { firstName: true, lastName: true, email: true, emailStatus: true },
          },
        },
      },
    },
  })
  // Demandes ACCEPTED reçues sur ses logements (chaque demandeur est prévenu)
  const receivedAccepted = await db.lodgingRequest.findMany({
    where: { listing: { ownerId: userId }, status: 'ACCEPTED' },
    select: {
      id: true,
      requester: { select: { firstName: true, email: true, emailStatus: true } },
      listing: {
        select: {
          category: true,
          title: true,
          beds: { select: { type: true, count: true, capacityEach: true } },
          owner: { select: { firstName: true } },
        },
      },
    },
  })

  const ids = [...sentAccepted, ...receivedAccepted].map((r) => r.id)
  if (ids.length > 0) {
    await db.lodgingRequest.updateMany({
      where: { id: { in: ids }, status: 'ACCEPTED' },
      data: { status: 'CANCELLED', cancelledBy: 'SYSTEM' },
    })
  }

  // Notifications APRÈS l'écriture, avant la suppression (fire-and-forget, idempotentes)
  for (const request of sentAccepted) {
    const title = listingOwnerTitle({
      category: request.listing.category,
      title: request.listing.title,
      beds: request.listing.beds,
      ownerFirstName: request.listing.owner.firstName,
    })
    const rendered = await renderRequestCancelledEmail({
      toFirstName: request.listing.owner.firstName,
      listingTitle: title,
      cancelledByLabel: 'le demandeur',
      actionUrl: `${appOrigin}/hebergeur/demandes`,
    })
    sendToRecipientAsync(request.listing.owner, {
      ...rendered,
      idempotencyKey: `cancelled/${request.id}`,
    })
  }
  for (const request of receivedAccepted) {
    const title = listingOwnerTitle({
      category: request.listing.category,
      title: request.listing.title,
      beds: request.listing.beds,
      ownerFirstName: request.listing.owner.firstName,
    })
    const rendered = await renderRequestCancelledEmail({
      toFirstName: request.requester.firstName,
      listingTitle: title,
      cancelledByLabel: "l'hébergeur",
      actionUrl: `${appOrigin}/mes-demandes`,
    })
    sendToRecipientAsync(request.requester, {
      ...rendered,
      idempotencyKey: `cancelled/${request.id}`,
    })
  }

  await deleteUserData(db, userId)
}
