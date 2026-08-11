import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Régression : le tableau des couchages est un conteneur `overflow-x: auto`.
 * Un conteneur à overflow non-visible rogne les `outline` des champs qu'il
 * contient — le focus ring orange (2px + offset 2px, cf. tokens.css) était
 * tronqué sur les bords. Le conteneur doit réserver 4px de padding interne,
 * compensés par une marge négative pour ne pas décaler la mise en page.
 */
describe('couchages — le focus ring n’est pas rogné par le conteneur de scroll', () => {
  const css = readFileSync(join(__dirname, '../src/pages/hebergeur.css'), 'utf8')

  function ruleBody(selector: string): string {
    const match = css.match(new RegExp(`(^|\\n)\\${selector}\\s*\\{([^}]*)\\}`))
    if (!match) throw new Error(`règle ${selector} introuvable dans hebergeur.css`)
    return match[2]
  }

  it('.couchages garde le scroll horizontal', () => {
    expect(ruleBody('.couchages')).toMatch(/overflow-x:\s*auto/)
  })

  it('.couchages réserve la place du focus ring (padding 4px compensé en marge)', () => {
    const body = ruleBody('.couchages')
    expect(body).toMatch(/padding:\s*4px/)
    expect(body).toMatch(/margin:\s*-4px/)
  })
})
