import type { Member, MemberCreate, MemberListQuery, MemberUpdate } from '@repo/contracts'
import { type Db, normalizeEmail } from '@repo/db'
import { MEMBER_DTO_SELECT } from './auth-service'

type MemberRow = {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string | null
  address: string | null
  birthDate: string | null
  emailStatus: 'OK' | 'BOUNCED' | 'COMPLAINED'
  createdAt: Date
  updatedAt: Date
}

/** Sérialisation Date → ISO. Le DTO est ensuite validé par MemberSchema.parse (§5). */
export function toMemberDTO(row: MemberRow): Member {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function listMembers(db: Db, query: MemberListQuery) {
  // Recherche « commence par » sur lastName — champ en clair précisément pour ça (§6).
  const where = query.search
    ? { lastName: { startsWith: query.search, mode: 'insensitive' as const } }
    : {}
  const [items, total] = await Promise.all([
    db.member.findMany({
      where,
      select: MEMBER_DTO_SELECT,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.member.count({ where }),
  ])
  return {
    items: items.map(toMemberDTO),
    total,
    page: query.page,
    pageSize: query.pageSize,
  }
}

export async function getMember(db: Db, id: string) {
  const row = await db.member.findUnique({ where: { id }, select: MEMBER_DTO_SELECT })
  return row ? toMemberDTO(row) : null
}

export async function createMember(db: Db, input: MemberCreate) {
  const row = await db.member.create({
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      email: normalizeEmail(input.email),
      phone: input.phone ?? null,
      address: input.address ?? null,
      birthDate: input.birthDate ?? null,
    },
    select: MEMBER_DTO_SELECT,
  })
  return toMemberDTO(row)
}

export async function updateMember(db: Db, id: string, input: MemberUpdate) {
  const row = await db.member.update({
    where: { id },
    data: {
      ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
      ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
      ...(input.email !== undefined ? { email: normalizeEmail(input.email) } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.birthDate !== undefined ? { birthDate: input.birthDate } : {}),
    },
    select: MEMBER_DTO_SELECT,
  })
  return toMemberDTO(row)
}

/** Marquage bounce/complaint via webhook Resend (§8). Lookup par blind index. */
export async function markEmailStatus(
  db: Db,
  emailInput: string,
  status: 'BOUNCED' | 'COMPLAINED',
): Promise<void> {
  const email = normalizeEmail(emailInput)
  await db.member.updateMany({ where: { email }, data: { emailStatus: status } })
}
