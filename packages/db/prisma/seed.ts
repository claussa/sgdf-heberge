/**
 * Seed de développement. Données fictives uniquement.
 * Lancer avec : pnpm --filter @repo/db db:seed
 */
import { getPrisma } from '../src/client'
import { normalizeEmail } from '../src/normalize'

const members = [
  {
    firstName: 'Alice',
    lastName: 'Martin',
    email: 'alice.martin@example.org',
    phone: '+33600000001',
    address: '12 rue des Lilas, 75011 Paris',
    birthDate: '1994-03-12',
  },
  {
    firstName: 'Bruno',
    lastName: 'Bernard',
    email: 'bruno.bernard@example.org',
    phone: '+33600000002',
    address: '3 avenue Jean Jaurès, 69007 Lyon',
    birthDate: '1988-11-02',
  },
  {
    firstName: 'Chloé',
    lastName: 'Dubois',
    email: 'chloe.dubois@example.org',
    phone: null,
    address: '8 place de la Comédie, 34000 Montpellier',
    birthDate: '2001-07-25',
  },
  {
    firstName: 'David',
    lastName: 'Petit',
    email: 'david.petit@example.org',
    phone: '+33600000004',
    address: null,
    birthDate: null,
  },
  {
    firstName: 'Emma',
    lastName: 'Durand',
    email: 'emma.durand@example.org',
    phone: '+33600000005',
    address: '27 boulevard Gambetta, 59000 Lille',
    birthDate: '1979-01-30',
  },
]

async function main() {
  const db = getPrisma()
  for (const member of members) {
    const email = normalizeEmail(member.email)
    const existing = await db.member.findFirst({ where: { email }, select: { id: true } })
    if (existing) {
      console.info(`— ${member.firstName} ${member.lastName} existe déjà`)
      continue
    }
    await db.member.create({ data: { ...member, email } })
    console.info(`✓ ${member.firstName} ${member.lastName} créé`)
  }
  await db.$disconnect()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
