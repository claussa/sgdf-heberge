import { describe, expect, it } from 'vitest'
import {
  MagicLinkRequestSchema,
  MemberCreateSchema,
  MemberListQuerySchema,
  MemberSchema,
} from '../src/index'

describe('MemberSchema (DTO de sortie)', () => {
  const valid = {
    id: 'cku123',
    firstName: 'Alice',
    lastName: 'Martin',
    email: 'alice@example.org',
    phone: null,
    address: null,
    birthDate: '1994-03-12',
    emailStatus: 'OK',
    createdAt: '2026-08-08T10:00:00.000Z',
    updatedAt: '2026-08-08T10:00:00.000Z',
  }

  it('accepte un DTO complet', () => {
    expect(MemberSchema.parse(valid)).toEqual(valid)
  })

  it('retire les champs non déclarés (minimisation §5)', () => {
    const parsed = MemberSchema.parse({ ...valid, emailHash: 'deadbeef', tokenHash: 'x' })
    expect(parsed).not.toHaveProperty('emailHash')
    expect(parsed).not.toHaveProperty('tokenHash')
  })

  it('rejette un email invalide', () => {
    expect(() => MemberSchema.parse({ ...valid, email: 'pas-un-email' })).toThrow()
  })
})

describe('MemberCreateSchema', () => {
  it('exige prénom, nom et email', () => {
    expect(() => MemberCreateSchema.parse({ email: 'a@b.fr' })).toThrow()
    expect(
      MemberCreateSchema.parse({ firstName: 'A', lastName: 'B', email: 'a@b.fr' }),
    ).toMatchObject({ email: 'a@b.fr' })
  })

  it('valide birthDate au format ISO date', () => {
    expect(() =>
      MemberCreateSchema.parse({
        firstName: 'A',
        lastName: 'B',
        email: 'a@b.fr',
        birthDate: '12/03/1994',
      }),
    ).toThrow()
  })
})

describe('MemberListQuerySchema', () => {
  it('applique les défauts et convertit les query strings', () => {
    expect(MemberListQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 })
    expect(MemberListQuerySchema.parse({ page: '3', pageSize: '50' })).toEqual({
      page: 3,
      pageSize: 50,
    })
  })

  it('plafonne pageSize à 100', () => {
    expect(() => MemberListQuerySchema.parse({ pageSize: '1000' })).toThrow()
  })
})

describe('MagicLinkRequestSchema', () => {
  it("n'accepte qu'un email", () => {
    expect(() => MagicLinkRequestSchema.parse({ email: 'nope' })).toThrow()
    expect(MagicLinkRequestSchema.parse({ email: 'ok@example.org' })).toEqual({
      email: 'ok@example.org',
    })
  })
})
