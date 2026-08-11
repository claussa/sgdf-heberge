/**
 * Seed de développement. Données fictives uniquement — alignées sur les données de démo
 * de la maquette hi-fi (docs/design/rapport-maquette.md, section D).
 * Lancer avec : pnpm --filter @repo/db db:seed
 */
import { getPrisma } from '../src/client'
import { normalizeEmail } from '../src/normalize'

const DAY = 24 * 60 * 60 * 1000
const now = Date.now()
const daysAgo = (n: number) => new Date(now - n * DAY)

// Dates de l'événement (cohérentes avec @repo/event-config, sans en dépendre :
// le seed reste un outil de dev, les vraies bornes viennent de la config)
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

async function main() {
  const db = getPrisma()

  const already = await db.user.findFirst({
    where: { email: normalizeEmail('marie.lefevre@exemple.fr') },
    select: { id: true },
  })
  if (already) {
    console.info('— seed déjà appliqué (marie.lefevre@exemple.fr existe), rien à faire')
    await db.$disconnect()
    return
  }

  // ————— Comptes —————
  const marie = await db.user.create({
    data: {
      accountType: 'INDIVIDUAL',
      firstName: 'Marie',
      lastName: 'Lefèvre',
      email: 'marie.lefevre@exemple.fr',
      phone: '06 98 76 54 32',
      groupSize: 3,
      accessibilityNeeds: JSON.stringify(['pmr']),
      onboardedAt: daysAgo(10),
    },
  })
  const claire = await db.user.create({
    data: {
      accountType: 'INDIVIDUAL',
      firstName: 'Claire',
      lastName: 'Martin',
      email: 'claire@exemple.fr',
      phone: '06 12 34 56 78',
      onboardedAt: daysAgo(12),
    },
  })
  const thomas = await db.user.create({
    data: {
      accountType: 'INDIVIDUAL',
      firstName: 'Thomas',
      lastName: 'Renard',
      email: 'thomas.renard@exemple.fr',
      phone: '06 55 44 33 22',
      groupSize: 1,
      onboardedAt: daysAgo(8),
    },
  })
  const lea = await db.user.create({
    data: {
      accountType: 'INDIVIDUAL',
      firstName: 'Léa',
      lastName: 'Fontaine',
      email: 'lea.fontaine@exemple.fr',
      phone: '06 21 32 43 54',
      groupSize: 2,
      onboardedAt: daysAgo(9),
    },
  })
  // Hébergeurs des autres logements de la grille de recherche
  const hugo = await db.user.create({
    data: {
      accountType: 'INDIVIDUAL',
      firstName: 'Hugo',
      lastName: 'Moreau',
      email: 'hugo.moreau@exemple.fr',
      phone: '06 10 20 30 40',
      onboardedAt: daysAgo(15),
    },
  })
  const ines = await db.user.create({
    data: {
      accountType: 'INDIVIDUAL',
      firstName: 'Inès',
      lastName: 'Rousseau',
      email: 'ines.rousseau@exemple.fr',
      phone: '06 11 22 33 44',
      onboardedAt: daysAgo(14),
    },
  })
  const karim = await db.user.create({
    data: {
      accountType: 'INDIVIDUAL',
      firstName: 'Karim',
      lastName: 'Belkacem',
      email: 'karim.belkacem@exemple.fr',
      phone: '06 99 88 77 66',
      onboardedAt: daysAgo(13),
    },
  })
  const bernadette = await db.user.create({
    data: {
      accountType: 'INDIVIDUAL',
      firstName: 'Bernadette',
      lastName: 'Soubirous',
      email: 'bernadette.soubirous@exemple.fr',
      phone: '06 65 43 21 09',
      onboardedAt: daysAgo(11),
    },
  })
  const admin = await db.user.create({
    data: {
      accountType: 'INDIVIDUAL',
      role: 'ADMIN',
      firstName: 'Ariane',
      lastName: 'Admin',
      email: 'admin@exemple.fr',
      phone: '06 00 00 00 00',
      onboardedAt: daysAgo(30),
    },
  })

  // ————— Unités scoutes (jumelage) —————
  const nancy = await db.user.create({
    data: {
      accountType: 'SCOUT_UNIT',
      firstName: 'Nina',
      lastName: 'Colin',
      email: '1nancy@exemple.fr',
      phone: '06 77 88 99 00',
      groupName: 'Groupe Saint-Sigisbert Nancy',
      unitName: '1re Nancy',
      unitBranch: 'Pionniers-Caravelles',
      onboardedAt: daysAgo(7),
    },
  })
  const woippy = await db.user.create({
    data: {
      accountType: 'SCOUT_UNIT',
      firstName: 'Marc',
      lastName: 'Weber',
      email: '1woippy@exemple.fr',
      phone: '06 12 21 12 21',
      groupName: 'Groupe Saint-Étienne Woippy',
      unitName: '1re Woippy',
      unitBranch: 'Pionniers-Caravelles',
      onboardedAt: daysAgo(9),
    },
  })
  const saintEloy = await db.user.create({
    data: {
      accountType: 'SCOUT_UNIT',
      firstName: 'Paul',
      lastName: 'Girard',
      email: 'saint.eloy@exemple.fr',
      phone: '06 22 33 44 55',
      groupName: 'Groupe Saint-Éloy Metz',
      unitName: '3e Metz Saint-Éloy',
      unitBranch: 'Scouts-Guides',
      onboardedAt: daysAgo(9),
    },
  })
  const segolene = await db.user.create({
    data: {
      accountType: 'SCOUT_UNIT',
      firstName: 'Sophie',
      lastName: 'Lambert',
      email: 'sainte.segolene@exemple.fr',
      phone: '06 31 41 59 26',
      groupName: 'Groupe Sainte-Ségolène Metz',
      unitName: 'Groupe Sainte-Ségolène',
      unitBranch: 'Scouts-Guides',
      onboardedAt: daysAgo(6),
    },
  })
  const verdun = await db.user.create({
    data: {
      accountType: 'SCOUT_UNIT',
      firstName: 'Anne',
      lastName: 'Petit',
      email: 'verdun@exemple.fr',
      phone: '06 11 22 33 44',
      groupName: 'Groupe Notre-Dame Verdun',
      unitName: '1re Verdun',
      unitBranch: 'Compagnons',
      onboardedAt: daysAgo(8),
    },
  })
  const epinal = await db.user.create({
    data: {
      accountType: 'SCOUT_UNIT',
      firstName: 'Lucas',
      lastName: 'Perrin',
      email: '2epinal@exemple.fr',
      phone: '06 44 55 66 77',
      groupName: 'Groupe Saint-Maurice Épinal',
      unitName: '2e Épinal',
      unitBranch: 'Scouts-Guides',
      onboardedAt: daysAgo(5),
    },
  })

  // ————— Logements —————
  const chezClaire = await db.listing.create({
    data: {
      ownerId: claire.id,
      category: 'PRIVATE',
      site: 'paris',
      description:
        'Chambre au 1er étage avec ascenseur, lit double. Arrivée possible à partir de 18 h, ' +
        'petit-déjeuner partagé. Trois marches dans le hall, puis ascenseur de 70 cm.',
      addressFull: '12 rue des Boulets, 75012 Paris',
      displayArea: 'Paris 12e',
      distanceKm: 2.1,
      availableFrom: d('2026-09-24'),
      availableTo: d('2026-09-29'),
      capacity: 8,
      accessPmr: true,
      accessFewSteps: true,
      accessTransport: true,
      accessQuiet: true,
      accessibilityNotes: 'Trois marches dans le hall, puis ascenseur de 70 cm.',
      beds: {
        create: [
          { type: 'PRIVATE_ROOM', count: 2, capacityEach: 2, note: '1er étage, ascenseur' },
          { type: 'COUCH', count: 1, capacityEach: 2, note: 'salon' },
          { type: 'FLOOR_BED', count: 2, capacityEach: 1, note: 'matelas au sol' },
        ],
      },
    },
  })
  const montreuil = await db.listing.create({
    data: {
      ownerId: hugo.id,
      category: 'PRIVATE',
      site: 'paris',
      description: 'Grande pièce à vivre, quatre lits de camp. Douche au rez-de-chaussée.',
      addressFull: '5 rue de la Fraternité, 93100 Montreuil',
      displayArea: 'Montreuil',
      distanceKm: 6.8,
      availableFrom: d('2026-09-24'),
      availableTo: d('2026-09-29'),
      capacity: 4,
      accessTransport: true,
      beds: { create: [{ type: 'FLOOR_BED', count: 4, capacityEach: 1, note: 'lits de camp' }] },
    },
  })
  const vincennes = await db.listing.create({
    data: {
      ownerId: ines.id,
      category: 'PRIVATE',
      site: 'paris',
      description: 'Jardin clos et calme, accès à une salle de bain dans la maison.',
      addressFull: '18 avenue des Minimes, 94300 Vincennes',
      displayArea: 'Vincennes',
      distanceKm: 7.4,
      availableFrom: d('2026-09-23'),
      availableTo: d('2026-09-30'),
      capacity: 6,
      accessQuiet: true,
      accessParking: true,
      beds: {
        create: [{ type: 'TENT_SPOT', count: 3, capacityEach: 2, note: 'pelouse plate' }],
      },
    },
  })
  await db.listing.create({
    data: {
      ownerId: karim.id,
      category: 'PRIVATE',
      site: 'paris',
      description: 'Canapé convertible dans le séjour, quartier animé, métro à 3 minutes.',
      addressFull: '44 rue de la Roquette, 75011 Paris',
      displayArea: 'Paris 11e',
      distanceKm: 1.9,
      availableFrom: d('2026-09-25'),
      availableTo: d('2026-09-28'),
      capacity: 2,
      accessTransport: true,
      beds: { create: [{ type: 'COUCH', count: 1, capacityEach: 2, note: 'convertible' }] },
    },
  })
  await db.listing.create({
    data: {
      ownerId: bernadette.id,
      category: 'PRIVATE',
      site: 'lourdes',
      description: 'Chambre calme à dix minutes à pied des sanctuaires.',
      addressFull: '7 rue du Ruisseau, 65100 Lourdes',
      displayArea: 'Lourdes',
      distanceKm: 0.8,
      availableFrom: d('2026-09-24'),
      availableTo: d('2026-09-29'),
      capacity: 2,
      accessFewSteps: true,
      accessQuiet: true,
      beds: { create: [{ type: 'PRIVATE_ROOM', count: 1, capacityEach: 2, note: 'lit double' }] },
    },
  })
  // Institutionnels (owner = admin)
  await db.listing.create({
    data: {
      ownerId: admin.id,
      category: 'HOTEL',
      site: 'paris',
      title: 'Hôtel Ibis Nation · chambres',
      description:
        'Lot de chambres négocié pour les bénévoles. Réservation directement sur la ' +
        'plateforme de l’hôtel avec le code promo.',
      addressFull: '2 avenue de Taillebourg, 75011 Paris',
      displayArea: 'Paris 12e',
      distanceKm: 2.4,
      availableFrom: d('2026-09-24'),
      availableTo: d('2026-09-29'),
      capacity: 40,
      priceInfo: '45 € · code PAPE15',
      bookingUrl: 'https://ibis.example.com/nation',
      accessPmr: true,
      accessTransport: true,
    },
  })
  await db.listing.create({
    data: {
      ownerId: admin.id,
      category: 'COLLECTIVE',
      site: 'paris',
      title: 'Gymnase Léo-Lagrange',
      description:
        'Couchage collectif au sol — apporter matelas et duvet. Sanitaires et douches sur place.',
      addressFull: '68 boulevard Poniatowski, 75012 Paris',
      displayArea: 'Paris 12e',
      distanceKm: 3.2,
      availableFrom: d('2026-09-24'),
      availableTo: d('2026-09-29'),
      capacity: 120,
      priceInfo: '10 € la nuit',
      accessPmr: true,
      accessTransport: true,
    },
  })

  // ————— Demandes (côté Marie : 3 en attente = quota plein ; côté Claire : 2 reçues) —————
  await db.lodgingRequest.create({
    data: {
      listingId: chezClaire.id,
      requesterId: marie.id,
      dateFrom: d('2026-09-25'),
      dateTo: d('2026-09-28'),
      peopleCount: 3,
      status: 'PENDING',
      awaitingSide: 'HOST',
      lastActivityAt: daysAgo(2),
      createdAt: daysAgo(2),
      messages: {
        create: [
          {
            senderId: marie.id,
            body:
              'Bonjour Claire, nous sommes trois bénévoles au service accueil, ' +
              'deux femmes et un homme, calmes et autonomes.',
            createdAt: daysAgo(2),
          },
        ],
      },
    },
  })
  await db.lodgingRequest.create({
    data: {
      listingId: montreuil.id,
      requesterId: marie.id,
      dateFrom: d('2026-09-25'),
      dateTo: d('2026-09-28'),
      peopleCount: 3,
      status: 'PENDING',
      awaitingSide: 'REQUESTER', // question posée hier → à Marie de répondre
      lastActivityAt: daysAgo(1),
      createdAt: daysAgo(3),
      messages: {
        create: [
          {
            senderId: marie.id,
            body: 'Bonjour, nous cherchons un couchage simple pour trois personnes.',
            createdAt: daysAgo(3),
          },
          { senderId: hugo.id, body: 'Vous arrivez avant 20 h ?', createdAt: daysAgo(1) },
        ],
      },
    },
  })
  await db.lodgingRequest.create({
    data: {
      listingId: vincennes.id,
      requesterId: marie.id,
      dateFrom: d('2026-09-25'),
      dateTo: d('2026-09-28'),
      peopleCount: 3,
      status: 'PENDING',
      awaitingSide: 'HOST',
      lastActivityAt: daysAgo(6), // expire demain
      createdAt: daysAgo(6),
      lastReminderAt: daysAgo(1),
      messages: {
        create: [
          {
            senderId: marie.id,
            body: 'Bonjour, nous avons deux tentes et nos duvets. Est-ce possible chez vous ?',
            createdAt: daysAgo(6),
          },
        ],
      },
    },
  })
  await db.lodgingRequest.create({
    data: {
      listingId: chezClaire.id,
      requesterId: thomas.id,
      dateFrom: d('2026-09-25'),
      dateTo: d('2026-09-28'),
      peopleCount: 1,
      status: 'PENDING',
      awaitingSide: 'REQUESTER', // Claire a posé une question hier
      lastActivityAt: daysAgo(1),
      createdAt: daysAgo(4),
      messages: {
        create: [
          {
            senderId: thomas.id,
            body: 'Bonjour, je viens seul pour le service logistique, je suis très flexible.',
            createdAt: daysAgo(4),
          },
          {
            senderId: claire.id,
            body: 'Bonjour Thomas, vous restez aussi la nuit du 28 ?',
            createdAt: daysAgo(1),
          },
        ],
      },
    },
  })
  // Une demande acceptée (onglet « Acceptées » des deux côtés)
  await db.lodgingRequest.create({
    data: {
      listingId: chezClaire.id,
      requesterId: lea.id,
      dateFrom: d('2026-09-25'),
      dateTo: d('2026-09-28'),
      peopleCount: 2,
      status: 'ACCEPTED',
      awaitingSide: 'HOST',
      lastActivityAt: daysAgo(1),
      createdAt: daysAgo(5),
      respondedAt: daysAgo(1),
      messages: {
        create: [
          {
            senderId: lea.id,
            body: 'Bonjour Claire, nous sommes deux guides aînées au service liturgie.',
            createdAt: daysAgo(5),
          },
        ],
      },
    },
  })

  // ————— Jumelage —————
  await db.jumelageAd.create({
    data: {
      userId: nancy.id,
      kind: 'SEEKING',
      site: 'metz',
      dateFrom: d('2026-09-25'),
      dateTo: d('2026-09-28'),
      peopleLabel: '18 jeunes + 3 chefs',
      description: 'Pionniers-caravelles au service animation, matériel de camp complet.',
    },
  })
  const adWoippy = await db.jumelageAd.create({
    data: {
      userId: woippy.id,
      kind: 'HOSTING',
      site: 'metz',
      dateFrom: d('2026-09-24'),
      dateTo: d('2026-09-29'),
      peopleLabel: '25 personnes',
      description: 'Local scout avec grande salle et terrain attenant.',
    },
  })
  const adSaintEloy = await db.jumelageAd.create({
    data: {
      userId: saintEloy.id,
      kind: 'HOSTING',
      site: 'metz',
      dateFrom: d('2026-09-25'),
      dateTo: d('2026-09-28'),
      peopleLabel: '30 personnes',
      description: 'Nous connaissons bien le quartier et pouvons vous aider à trouver où dormir.',
    },
  })
  await db.jumelageAd.create({
    data: {
      userId: segolene.id,
      kind: 'HOSTING',
      site: 'metz',
      dateFrom: d('2026-09-25'),
      dateTo: d('2026-09-28'),
      peopleLabel: '12 personnes',
      description: 'Salle paroissiale au centre-ville, cuisine équipée.',
    },
  })
  const adVerdun = await db.jumelageAd.create({
    data: {
      userId: verdun.id,
      kind: 'HOSTING',
      site: 'metz',
      dateFrom: d('2026-09-24'),
      dateTo: d('2026-09-29'),
      peopleLabel: '20 personnes',
      description: 'Local des compagnons, proche de la gare.',
    },
  })
  await db.jumelageAd.create({
    data: {
      userId: epinal.id,
      kind: 'SEEKING',
      site: 'metz',
      dateFrom: d('2026-09-24'),
      dateTo: d('2026-09-29'),
      peopleLabel: '16 personnes',
      description: 'Nous venons pour le service liturgie, nous avons notre matériel de cuisine.',
    },
  })

  // Mises en relation de la 1re Nancy : 2 acceptées + 1 reçue en attente
  await db.jumelageContact.create({
    data: {
      adId: adSaintEloy.id,
      requesterId: nancy.id,
      message: 'Nous serons 21, nous cherchons un lieu où poser nos tentes ou dormir en dur.',
      status: 'ACCEPTED',
      acceptedAt: daysAgo(2),
      createdAt: daysAgo(3),
    },
  })
  await db.jumelageContact.create({
    data: {
      adId: adVerdun.id,
      requesterId: nancy.id,
      message: 'Bonjour, notre unité cherche un point de chute du 25 au 28.',
      status: 'ACCEPTED',
      acceptedAt: daysAgo(1),
      createdAt: daysAgo(2),
    },
  })
  // Contact reçu par la 1re Woippy (hosting) de la part de la 2e Épinal
  await db.jumelageContact.create({
    data: {
      adId: adWoippy.id,
      requesterId: epinal.id,
      message: 'Nous venons pour le service liturgie, nous avons notre matériel de cuisine.',
      createdAt: daysAgo(1),
    },
  })

  console.info('✓ seed appliqué : 14 comptes, 7 logements, 5 demandes, 6 annonces jumelage')
  console.info('  Comptes de démo : marie.lefevre@exemple.fr · claire@exemple.fr ·')
  console.info('  1nancy@exemple.fr · admin@exemple.fr (role ADMIN) — connexion par magic link')
  await db.$disconnect()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
