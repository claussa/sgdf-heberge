/**
 * Schémas Zod partagés API ↔ SPA (§4).
 * Ce package ne dépend que de Zod et de @repo/event-config (entorse documentée : la liste
 * des sites vient de la config événement, c'est le cœur de la réutilisabilité).
 *
 * Règle de minimisation (§5) : chaque schéma de réponse est la liste exhaustive des
 * champs autorisés à sortir. Tout `c.json()` doit être précédé d'un `Schema.parse()`.
 * Les coordonnées (téléphone, adresse complète, email) n'apparaissent QUE dans les
 * variantes de schéma où leur exposition est légitime (demande acceptée, mise en
 * relation acceptée, vue hébergeur d'une demande reçue).
 */
import { SiteSchema } from '@repo/event-config'
import { z } from 'zod'

export { SiteSchema }

// ---------------------------------------------------------------------------
// Bornes de saisie
// ---------------------------------------------------------------------------

/** Bornes de saisie, partagées entre les schémas et les attributs des formulaires SPA. */
export const INPUT_LIMITS = {
  email: 320,
  bedCount: { min: 1, max: 50 },
  bedCapacity: { min: 1, max: 20 },
  bedNote: 200,
  beds: { min: 1, max: 20 },
  description: 2000,
  accessibilityNotes: 1000,
  /** Profil (`groupSize`), filtre de recherche (`?people=`) et demande (`peopleCount`). */
  people: { min: 1, max: 600 },
  requestMessage: { min: 1, max: 2000 },
  jumelagePeopleLabel: { min: 1, max: 80 },
  jumelageDescription: 1000,
  jumelageContactMessage: 1000,
  adminTitle: { min: 1, max: 200 },
  adminCapacity: { min: 1, max: 10000 },
  adminPriceInfo: 120,
  adminBookingUrl: 500,
} as const

// ---------------------------------------------------------------------------
// Erreurs — format unique, déclaré dans le spec OpenAPI (§5)
// ---------------------------------------------------------------------------

export const ErrorCode = z.enum([
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'INTERNAL',
])
export type ErrorCode = z.infer<typeof ErrorCode>

export const ErrorResponseSchema = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
  }),
})
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>

export const OkResponseSchema = z.object({ ok: z.literal(true) })
export const HealthResponseSchema = z.object({ status: z.literal('ok') })

// ---------------------------------------------------------------------------
// Enums du domaine (miroir du schéma Prisma — la DB reste la source de vérité)
// ---------------------------------------------------------------------------

export const AccountTypeSchema = z.enum(['INDIVIDUAL', 'SCOUT_UNIT'])
export type AccountType = z.infer<typeof AccountTypeSchema>

export const RoleSchema = z.enum(['USER', 'ADMIN'])
export const EmailStatusSchema = z.enum(['OK', 'BOUNCED', 'COMPLAINED'])

/** Résultat d'un tour guidé (hébergeur ou volontaire) — null = jamais proposé (voir MeSchema) */
export const TourStatusSchema = z.enum(['SKIPPED', 'DONE'])
export type TourStatus = z.infer<typeof TourStatusSchema>

export const ListingCategorySchema = z.enum(['PRIVATE', 'HOTEL', 'COLLECTIVE', 'SCOUT_BASE'])
export type ListingCategory = z.infer<typeof ListingCategorySchema>

export const ListingStatusSchema = z.enum(['OPEN', 'FULL'])

export const BedTypeSchema = z.enum(['PRIVATE_ROOM', 'COUCH', 'FLOOR_BED', 'TENT_SPOT'])
export type BedType = z.infer<typeof BedTypeSchema>

export const RequestStatusSchema = z.enum([
  'PENDING',
  'ACCEPTED',
  'DECLINED',
  'EXPIRED',
  'CANCELLED',
])
export type RequestStatus = z.infer<typeof RequestStatusSchema>

export const AwaitingSideSchema = z.enum(['HOST', 'REQUESTER'])
export const JumelageKindSchema = z.enum(['SEEKING', 'HOSTING'])
export type JumelageKind = z.infer<typeof JumelageKindSchema>

/** Slugs de la grille d'accessibilité (8 critères du cadrage, relus par une ergothérapeute) */
export const ACCESS_CRITERIA = [
  'pmr',
  'electricWheelchair',
  'fewSteps',
  'humanHelp',
  'transport',
  'parking',
  'assistanceDog',
  'quiet',
] as const
export const AccessCriterionSchema = z.enum(ACCESS_CRITERIA)
export type AccessCriterion = z.infer<typeof AccessCriterionSchema>

/** Grille d'accessibilité d'un logement (booléens publics — caractéristiques du bâtiment) */
export const AccessGridSchema = z.object({
  pmr: z.boolean(),
  electricWheelchair: z.boolean(),
  fewSteps: z.boolean(),
  humanHelp: z.boolean(),
  transport: z.boolean(),
  parking: z.boolean(),
  assistanceDog: z.boolean(),
  quiet: z.boolean(),
})
export type AccessGrid = z.infer<typeof AccessGridSchema>

/**
 * Facilité de se garer à proximité du logement (jauge publique) — distincte du
 * critère d'accessibilité `parking`, qui vise la dépose/place PMR proche de l'entrée.
 */
export const PARKING_EASE = ['EASY', 'MEDIUM', 'HARD'] as const
export const ParkingEaseSchema = z.enum(PARKING_EASE)
export type ParkingEase = z.infer<typeof ParkingEaseSchema>

// ---------------------------------------------------------------------------
// Auth / compte
// ---------------------------------------------------------------------------

export const MagicLinkRequestSchema = z.object({
  email: z.email().max(INPUT_LIMITS.email),
})

/**
 * Délai minimal entre deux envois de lien pour un même email. Partagé front/back :
 * le compte à rebours affiché sur l'écran de connexion ET la garde en base
 * (`requestMagicLink` saute silencieusement tout renvoi plus tôt — anti-énumération
 * oblige, la réponse HTTP reste identique).
 */
export const MAGIC_LINK_RESEND_COOLDOWN_SECONDS = 5 * 60

/**
 * Réponse STRICTEMENT identique que l'email existe ou non (anti-énumération, §9).
 * Copy de la maquette, TTL corrigé à 10 minutes (§9 — multi-usage plafonné, pas
 * d'« usage unique » contrairement au texte de la maquette).
 */
export const MagicLinkRequestResponseSchema = z.object({
  ok: z.literal(true),
  message: z.literal(
    'Le lien est parti ! Vérifie ta boîte mail (et tes spams) : il est valable 10 minutes.',
  ),
})

/** Profil du connecté — /me. accountType null = onboarding pas encore fait. */
export const MeSchema = z.object({
  id: z.string(),
  accountType: AccountTypeSchema.nullable(),
  role: RoleSchema,
  email: z.email(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  phone: z.string().nullable(),
  groupSize: z.number().int().nullable(),
  accessibilityNeeds: z.array(AccessCriterionSchema),
  unitName: z.string().nullable(),
  unitBranch: z.string().nullable(),
  onboardedAt: z.iso.datetime().nullable(),
  /** Pilote la fusion de navigation (espace hébergeur visible) */
  hasListings: z.boolean(),
  /** Espace volontaire (recherche) activé — false = hébergeur pur, nav hébergeur seule */
  seeksAccommodation: z.boolean(),
  /** Tour guidé hébergeur : null = à proposer (sur « Mes logements », si un logement existe) */
  hostTourStatus: TourStatusSchema.nullable(),
  /** Tour guidé volontaire : null = à proposer (sur la recherche, si l'espace est ouvert) */
  seekerTourStatus: TourStatusSchema.nullable(),
  /** Tour guidé unité : null = à proposer (sur le jumelage, si une annonce est active) */
  unitTourStatus: TourStatusSchema.nullable(),
  /** Unités : une annonce ACTIVE existe */
  hasActiveAd: z.boolean(),
  createdAt: z.iso.datetime(),
})
export type Me = z.infer<typeof MeSchema>

const IndividualProfileFields = {
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().min(6).max(20),
  groupSize: z.number().int().min(INPUT_LIMITS.people.min).max(INPUT_LIMITS.people.max).nullish(),
  accessibilityNeeds: z.array(AccessCriterionSchema).max(8).optional(),
}

const UnitProfileFields = {
  unitName: z.string().min(1).max(120),
  unitBranch: z.string().min(1).max(60),
  /** Prénom et nom du responsable — révélés à la mise en relation acceptée */
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().min(6).max(20),
}

/**
 * Active l'espace volontaire (nav recherche + demandes). Interrupteur à sens unique :
 * posé par le parcours « Je cherche un logement », jamais désactivable — le parcours
 * hébergeur ne l'envoie pas.
 */
const SeeksAccommodationField = { seeksAccommodation: z.literal(true).optional() }

/** Onboarding : pose accountType UNE fois (bascule refusée ensuite) + profil initial */
export const OnboardingSchema = z.discriminatedUnion('accountType', [
  z.object({
    accountType: z.literal('INDIVIDUAL'),
    ...IndividualProfileFields,
    ...SeeksAccommodationField,
  }),
  z.object({ accountType: z.literal('SCOUT_UNIT'), ...UnitProfileFields }),
])
export type OnboardingInput = z.infer<typeof OnboardingSchema>

/**
 * Résultat des tours guidés. À sens unique (jamais remis à null) : SKIPPED à un refus
 * ou un abandon, DONE au bout du parcours. host/seeker pour les comptes INDIVIDUAL,
 * unit pour les SCOUT_UNIT — chaque type ignore les champs de l'autre.
 */
const TourStatusFields = {
  hostTourStatus: TourStatusSchema.optional(),
  seekerTourStatus: TourStatusSchema.optional(),
  unitTourStatus: TourStatusSchema.optional(),
}

/** Mise à jour du profil (sans accountType) — l'API valide les champs selon le type */
export const ProfileUpdateSchema = z
  .object({
    ...IndividualProfileFields,
    ...UnitProfileFields,
    ...SeeksAccommodationField,
    ...TourStatusFields,
  })
  .partial()
export type ProfileUpdateInput = z.infer<typeof ProfileUpdateSchema>

export const UserExportSchema = z.object({
  format: z.literal('heberge/user-export'),
  version: z.literal(1),
  user: z.record(z.string(), z.unknown()),
})

// ---------------------------------------------------------------------------
// Logements
// ---------------------------------------------------------------------------

export const BedInputSchema = z.object({
  type: BedTypeSchema,
  count: z.number().int().min(INPUT_LIMITS.bedCount.min).max(INPUT_LIMITS.bedCount.max),
  capacityEach: z
    .number()
    .int()
    .min(INPUT_LIMITS.bedCapacity.min)
    .max(INPUT_LIMITS.bedCapacity.max),
  note: z.string().max(INPUT_LIMITS.bedNote).nullish(),
})

export const BedSchema = z.object({
  type: BedTypeSchema,
  count: z.number().int(),
  capacityEach: z.number().int(),
  note: z.string().nullable(),
})

/** Adresse choisie dans l'autocomplete BAN — jamais de saisie libre (maquette) */
export const AddressInputSchema = z.object({
  /** Libellé complet BAN, ex. « 12 rue des Boulets, 75012 Paris » — stocké chiffré */
  label: z.string().min(5).max(300),
  city: z.string().min(1).max(120),
  postcode: z.string().min(2).max(12),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})

/**
 * Carte de résultat de recherche — JAMAIS d'adresse, jamais de coordonnées :
 * seul displayArea (« Paris 12e ») est public avant acceptation.
 */
export const ListingCardSchema = z.object({
  id: z.string(),
  category: ListingCategorySchema,
  site: SiteSchema,
  /** PRIVATE : dérivé (« Chambre privée · 2 places ») ; institutionnels : title en base */
  title: z.string(),
  displayArea: z.string(),
  distanceKm: z.number().nullable(),
  capacity: z.number().int(),
  availableFrom: z.iso.date(),
  availableTo: z.iso.date(),
  access: AccessGridSchema,
  /** Facilité de stationnement — null = non renseigné (le champ est facultatif) */
  parkingEase: ParkingEaseSchema.nullable(),
  /** Types de couchages présents (icône + sous-titre carte) */
  bedTypes: z.array(BedTypeSchema),
  /** Institutionnels : « 45 € · code PAPE15 » */
  priceInfo: z.string().nullable(),
  /** Institutionnels : badge « Payant » (checkbox admin), indépendant de priceInfo */
  isPaid: z.boolean(),
})
export type ListingCard = z.infer<typeof ListingCardSchema>

export const ListingDetailSchema = ListingCardSchema.extend({
  description: z.string().nullable(),
  accessibilityNotes: z.string().nullable(),
  /** « chez Claire M. » — null pour les institutionnels */
  hostDisplayName: z.string().nullable(),
  beds: z.array(BedSchema),
  /** Hôtels et bases scoutes avec lien : bouton de réservation externe */
  bookingUrl: z.string().nullable(),
})
export type ListingDetail = z.infer<typeof ListingDetailSchema>

/** Vue propriétaire (formulaire d'édition + liste « Mes logements ») */
export const MyListingSchema = ListingDetailSchema.extend({
  status: ListingStatusSchema,
  hiddenAt: z.iso.datetime().nullable(),
  /** Sa propre adresse, déchiffrée — uniquement pour le propriétaire */
  addressFull: z.string(),
  pendingRequests: z.number().int(),
  /** Σ peopleCount des demandes acceptées — remplissage « 3/8 places » (A.8) */
  acceptedPeople: z.number().int(),
})
export type MyListing = z.infer<typeof MyListingSchema>

/**
 * Au moins une nuit : la fin doit être STRICTEMENT après le début (from === to serait
 * un séjour de zéro nuit). Comparaison lexicographique, correcte pour l'ISO.
 * Appliqué aux schémas d'ENTRÉE uniquement — jamais aux schémas de réponse.
 */
const NUIT_MINIMUM = 'La date de fin doit être après la date de début (au moins une nuit).'

const listingUpsertFields = z.object({
  site: SiteSchema,
  availableFrom: z.iso.date(),
  availableTo: z.iso.date(),
  description: z.string().max(INPUT_LIMITS.description).nullish(),
  address: AddressInputSchema,
  beds: z.array(BedInputSchema).min(INPUT_LIMITS.beds.min).max(INPUT_LIMITS.beds.max),
  access: AccessGridSchema,
  accessibilityNotes: z.string().max(INPUT_LIMITS.accessibilityNotes).nullish(),
  parkingEase: ParkingEaseSchema.nullish(),
})

export const ListingUpsertSchema = listingUpsertFields.refine(
  (v) => v.availableFrom < v.availableTo,
  { error: NUIT_MINIMUM, path: ['availableTo'] },
)
export type ListingUpsertInput = z.infer<typeof ListingUpsertSchema>

/**
 * Mise à jour d'un logement : l'adresse est OPTIONNELLE — absente, elle est conservée
 * telle quelle (le propriétaire n'a pas à repasser par l'autocomplete BAN pour changer
 * une description). Si le site change sans nouvelle adresse, la distance est remise à
 * null (les coordonnées ne sont pas stockées).
 */
export const ListingUpdateSchema = listingUpsertFields
  .partial({ address: true })
  .refine((v) => v.availableFrom < v.availableTo, { error: NUIT_MINIMUM, path: ['availableTo'] })
export type ListingUpdateInput = z.infer<typeof ListingUpdateSchema>

export const ListingStatusUpdateSchema = z.object({ status: ListingStatusSchema })

/** Chips de filtre « Type » : couchages + catégories institutionnelles */
export const SearchTypeSchema = z.enum([
  'PRIVATE_ROOM',
  'COUCH',
  'FLOOR_BED',
  'TENT_SPOT',
  'HOTEL',
  'COLLECTIVE',
  'SCOUT_BASE',
])
export type SearchType = z.infer<typeof SearchTypeSchema>

const queryArray = <T extends z.ZodType>(item: T) =>
  z.preprocess((v) => (typeof v === 'string' ? [v] : v), z.array(item)).optional()

export const ListingSearchQuerySchema = z
  .object({
    site: SiteSchema,
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    /** Filtre `capacity >= people` — même borne que `RequestCreateSchema.peopleCount`. */
    people: z.coerce
      .number()
      .int()
      .min(INPUT_LIMITS.people.min)
      .max(INPUT_LIMITS.people.max)
      .optional(),
    types: queryArray(SearchTypeSchema),
    /** Slugs d'accessibilité exigés (filtre « compatibles avec mes besoins ») */
    access: queryArray(AccessCriterionSchema),
    /** Facilité de stationnement MINIMALE exigée (MEDIUM = facile ou moyen) */
    parking: ParkingEaseSchema.optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(60).default(24),
  })
  .refine((v) => v.from === undefined || v.to === undefined || v.from < v.to, {
    error: NUIT_MINIMUM,
    path: ['to'],
  })

export const ListingSearchResponseSchema = z.object({
  items: z.array(ListingCardSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
})

export const MyListingsResponseSchema = z.object({ items: z.array(MyListingSchema) })

/**
 * Vue admin d'un logement institutionnel — MyListing + compteurs réservés à l'admin.
 * Jamais servi par les routes /my/listings ni par la fiche publique.
 */
export const AdminListingSchema = MyListingSchema.extend({
  /** Clics sur le lien de réservation externe (agrégé, 0 pour les logements sans lien) */
  bookingClicks: z.number().int(),
})
export type AdminListing = z.infer<typeof AdminListingSchema>

export const AdminListingsResponseSchema = z.object({ items: z.array(AdminListingSchema) })

// ---------------------------------------------------------------------------
// Demandes d'hébergement
// ---------------------------------------------------------------------------

export const RequestCreateSchema = z
  .object({
    dateFrom: z.iso.date(),
    dateTo: z.iso.date(),
    peopleCount: z.number().int().min(INPUT_LIMITS.people.min).max(INPUT_LIMITS.people.max),
    message: z.string().min(INPUT_LIMITS.requestMessage.min).max(INPUT_LIMITS.requestMessage.max),
  })
  .refine((v) => v.dateFrom < v.dateTo, { error: NUIT_MINIMUM, path: ['dateTo'] })
export type RequestCreateInput = z.infer<typeof RequestCreateSchema>

export const RequestMessageCreateSchema = z.object({
  body: z.string().min(INPUT_LIMITS.requestMessage.min).max(INPUT_LIMITS.requestMessage.max),
})

export const RequestMessageSchema = z.object({
  id: z.string(),
  /** HOST = message de l'hébergeur (« question posée »), REQUESTER = du demandeur */
  from: AwaitingSideSchema,
  body: z.string(),
  createdAt: z.iso.datetime(),
})

const requestCommon = {
  id: z.string(),
  dateFrom: z.iso.date(),
  dateTo: z.iso.date(),
  peopleCount: z.number().int(),
  /**
   * effectiveStatus : PENDING logiquement périmé (lastActivityAt < now − 7 j) est
   * présenté EXPIRED sans attendre le passage du job quotidien.
   */
  status: RequestStatusSchema,
  effectiveStatus: RequestStatusSchema,
  awaitingSide: AwaitingSideSchema,
  lastActivityAt: z.iso.datetime(),
  /** lastActivityAt + 7 j — pour « Expire dans N jours » */
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  messages: z.array(RequestMessageSchema),
}

/** Coordonnées complètes de l'hébergeur — UNIQUEMENT sur une demande ACCEPTED */
export const HostContactSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string(),
  email: z.email(),
  addressFull: z.string(),
})

const requesterListing = z.object({
  id: z.string(),
  title: z.string(),
  displayArea: z.string(),
  site: SiteSchema,
  category: ListingCategorySchema,
})

/** Vue demandeur. Variante ACCEPTED = la seule qui porte les coordonnées. */
export const RequestRequesterViewSchema = z.discriminatedUnion('effectiveStatus', [
  z.object({
    ...requestCommon,
    effectiveStatus: z.literal('ACCEPTED'),
    listing: requesterListing,
    /** « chez Claire M. » */
    hostDisplayName: z.string(),
    hostContact: HostContactSchema,
  }),
  z.object({
    ...requestCommon,
    effectiveStatus: z.enum(['PENDING', 'DECLINED', 'EXPIRED', 'CANCELLED']),
    listing: requesterListing,
    hostDisplayName: z.string(),
  }),
])
export type RequestRequesterView = z.infer<typeof RequestRequesterViewSchema>

/**
 * Vue hébergeur d'une demande reçue : téléphone du demandeur transmis D'EMBLÉE
 * (« c'est à toi de la contacter »), besoins d'accessibilité, alerte sur-capacité.
 */
export const RequestHostViewSchema = z.object({
  ...requestCommon,
  listingId: z.string(),
  listingTitle: z.string(),
  requester: z.object({
    firstName: z.string(),
    lastName: z.string(),
    phone: z.string(),
    needs: z.array(AccessCriterionSchema),
  }),
  /** peopleCount > capacité du logement → badge rouge « N pers. pour M places » */
  overCapacity: z.boolean(),
})
export type RequestHostView = z.infer<typeof RequestHostViewSchema>

export const MyRequestsResponseSchema = z.object({
  items: z.array(RequestRequesterViewSchema),
  /** PENDING effectifs / plafond — bandeau quota « 3 sollicitations en attente sur 3 » */
  pendingCount: z.number().int(),
  pendingLimit: z.number().int(),
})

export const ReceivedRequestsResponseSchema = z.object({
  items: z.array(RequestHostViewSchema),
})

// ---------------------------------------------------------------------------
// Jumelage (unités scoutes) — pure mise en relation
// ---------------------------------------------------------------------------

export const JumelageAdSchema = z.object({
  id: z.string(),
  kind: JumelageKindSchema,
  site: SiteSchema,
  dateFrom: z.iso.date(),
  dateTo: z.iso.date(),
  /** Texte libre : « 18 jeunes + 3 chefs » / « 30 personnes » */
  peopleLabel: z.string(),
  description: z.string().nullable(),
  unitName: z.string(),
  unitBranch: z.string().nullable(),
  createdAt: z.iso.datetime(),
})
export type JumelageAd = z.infer<typeof JumelageAdSchema>

export const JumelageAdUpsertSchema = z
  .object({
    kind: JumelageKindSchema,
    site: SiteSchema,
    dateFrom: z.iso.date(),
    dateTo: z.iso.date(),
    peopleLabel: z
      .string()
      .min(INPUT_LIMITS.jumelagePeopleLabel.min)
      .max(INPUT_LIMITS.jumelagePeopleLabel.max),
    description: z.string().max(INPUT_LIMITS.jumelageDescription).nullish(),
  })
  .refine((v) => v.dateFrom < v.dateTo, { error: NUIT_MINIMUM, path: ['dateTo'] })

export const MyJumelageAdSchema = JumelageAdSchema.extend({
  status: z.enum(['ACTIVE', 'WITHDRAWN']),
})

export const JumelageAdsResponseSchema = z.object({
  items: z.array(JumelageAdSchema),
  total: z.number().int(),
})

export const JumelageContactCreateSchema = z.object({
  message: z.string().max(INPUT_LIMITS.jumelageContactMessage).nullish(),
})

/** Contact reçu sur notre annonce — coordonnées seulement si ACCEPTED */
export const JumelageReceivedContactSchema = z.discriminatedUnion('status', [
  z.object({
    id: z.string(),
    status: z.literal('ACCEPTED'),
    unitName: z.string(),
    unitBranch: z.string().nullable(),
    peopleLabel: z.string().nullable(),
    dates: z.string().nullable(),
    message: z.string().nullable(),
    createdAt: z.iso.datetime(),
    contact: z.object({ name: z.string(), email: z.email(), phone: z.string() }),
  }),
  z.object({
    id: z.string(),
    status: z.literal('PENDING'),
    unitName: z.string(),
    unitBranch: z.string().nullable(),
    peopleLabel: z.string().nullable(),
    dates: z.string().nullable(),
    message: z.string().nullable(),
    createdAt: z.iso.datetime(),
  }),
])
export type JumelageReceivedContact = z.infer<typeof JumelageReceivedContactSchema>

/** Mise en relation aboutie (vue des deux côtés) : coordonnées mutuelles */
export const JumelageRelationSchema = z.object({
  id: z.string(),
  unitName: z.string(),
  unitBranch: z.string().nullable(),
  contactName: z.string(),
  email: z.email(),
  phone: z.string(),
  acceptedAt: z.iso.datetime(),
})

export const MyJumelageResponseSchema = z.object({
  ad: MyJumelageAdSchema.nullable(),
  received: z.array(JumelageReceivedContactSchema),
  relations: z.array(JumelageRelationSchema),
  /** Contacts que NOUS avons envoyés et qui sont encore sans réponse */
  sentPending: z.array(
    z.object({
      id: z.string(),
      adId: z.string(),
      unitName: z.string(),
      createdAt: z.iso.datetime(),
    }),
  ),
})

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export const AdminSiteMetricsSchema = z.object({
  site: SiteSchema,
  listings: z.object({
    privateActive: z.number().int(),
    privateHidden: z.number().int(),
    hotel: z.number().int(),
    collective: z.number().int(),
    scoutBase: z.number().int(),
    totalCapacity: z.number().int(),
  }),
  requests: z.object({
    pending: z.number().int(),
    accepted: z.number().int(),
    declined: z.number().int(),
    expired: z.number().int(),
    cancelled: z.number().int(),
  }),
  jumelage: z.object({
    seeking: z.number().int(),
    hosting: z.number().int(),
    relations: z.number().int(),
  }),
})

export const AdminMetricsSchema = z.object({
  sites: z.array(AdminSiteMetricsSchema),
  users: z.object({
    individuals: z.number().int(),
    units: z.number().int(),
    shells: z.number().int(),
  }),
})

export const AdminListingUpsertSchema = z
  .object({
    category: z.enum(['HOTEL', 'COLLECTIVE', 'SCOUT_BASE']),
    site: SiteSchema,
    title: z.string().min(INPUT_LIMITS.adminTitle.min).max(INPUT_LIMITS.adminTitle.max),
    description: z.string().max(INPUT_LIMITS.description).nullish(),
    address: AddressInputSchema,
    capacity: z
      .number()
      .int()
      .min(INPUT_LIMITS.adminCapacity.min)
      .max(INPUT_LIMITS.adminCapacity.max),
    priceInfo: z.string().max(INPUT_LIMITS.adminPriceInfo).nullish(),
    /** Badge « Payant » sur la carte de recherche — même sans priceInfo */
    isPaid: z.boolean().default(false),
    bookingUrl: z.url().max(INPUT_LIMITS.adminBookingUrl).nullish(),
    availableFrom: z.iso.date(),
    availableTo: z.iso.date(),
    access: AccessGridSchema,
    accessibilityNotes: z.string().max(INPUT_LIMITS.accessibilityNotes).nullish(),
    parkingEase: ParkingEaseSchema.nullish(),
  })
  .refine((v) => v.availableFrom < v.availableTo, { error: NUIT_MINIMUM, path: ['availableTo'] })

/**
 * Compte administrateur vu par la page /admin/administrateurs. L'e-mail n'est
 * servi qu'aux admins (route protégée) — jamais sur une réponse publique.
 */
export const AdminUserSchema = z.object({
  id: z.string(),
  email: z.email(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  /** null = coquille : promu avant sa première connexion */
  accountType: AccountTypeSchema.nullable(),
  createdAt: z.iso.datetime(),
})
export type AdminUser = z.infer<typeof AdminUserSchema>

export const AdminUsersResponseSchema = z.object({ items: z.array(AdminUserSchema) })

export const AdminPromoteSchema = z.object({ email: z.email().max(INPUT_LIMITS.email) })
