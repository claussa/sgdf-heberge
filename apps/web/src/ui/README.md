# UI kit — plateforme hébergement

Composants de la charte (maquette hi-fi, rapport C.3–C.6). Règles absolues :
**aucune ombre, aucun `border-radius`** (sauf 3px sur les inputs), **aucun emoji,
aucune lib d'icônes** — les signes PNG (`SigneImage`) sont la seule iconographie.
Palette et easing dans `src/styles/tokens.css` ; tout le CSS du kit est dans `ui.css`
(chargé par `./index.ts`). Import unique :

```tsx
import { Button, Card, Field, Input } from '../ui'
```

Poser la classe `fade` (globale) sur la racine de chaque écran pour l'animation
d'entrée (C.8). Utilitaires texte fournis par `ui.css` : `.text-body` (14px bleu),
`.alert-text` (13px rouge), `.divider` (`<hr className="divider" />`).

## Button

```tsx
type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' // défaut primary
  size?: 'md' | 'sm'                // md : 46/42px · sm : 40/38px (cartes)
  block?: boolean                   // pleine largeur
}
```

`type="button"` par défaut — passer `type="submit"` dans les formulaires.
Largeur mini des CTA au cas par cas : `style={{ minWidth: 220, alignSelf: 'flex-start' }}`.

```tsx
<Button type="submit" style={{ minWidth: 220, alignSelf: 'flex-start' }}>
  Enregistrer et rechercher
</Button>
<Button variant="secondary" size="sm">Annuler ma demande</Button>
```

## Field / FieldGroup / Input / Select / Textarea

```tsx
<Field label="Téléphone" glose="transmis avec la demande">   // label 11px uppercase + « — glose »
  <Input type="tel" value={phone} onChange={…} />
</Field>
```

- `Field` rend un `<label>` (un seul contrôle, ou une paire accolée via
  `<span className="field__pair">…</span>`).
- `FieldGroup` rend un `<div>` — obligatoire autour de `Checkbox`/`Radio`
  (pas de labels imbriqués), gap 10px.
- `Input` : `uiSize?: 'md' | 'lg' | 'sm' | 'xs'` → 42 / 44 (connexion) / 36 (tableaux) /
  34px (filtres). `disabled` = style grisé automatique (fond `#ebeff2`, texte `#66899e`).
- `Select` : chevron `▾` intégré (wrapper `.select-wrap`, prop `wrapClassName`).
- `Textarea` : `uiSize?: 'md' | 'sm' | 'lg'` → min-height 80 / 64 / 88px.

## Checkbox / Radio

```tsx
<Checkbox checked={…} onChange={…} label={<><b>Peu d’obstacles</b> — quelques marches…</>} />
<Radio name="sens" checked={…} onChange={…} label={<>Nous <b>cherchons</b> un jumelage sur place</>} />
```

Carré 18px (coché = carré plein 10px) / rond 18px (coché = disque 9px). `label` est un
`ReactNode` (gras autorisé). Toutes les props natives d'`<input>` passent (sauf `type`).

## Chip

```tsx
<Chip active={site === 'paris'} onClick={…}>Paris</Chip>
```

Toggle 13px, actif = fond bleu texte blanc. `aria-pressed` géré.

## Tabs

```tsx
<Tabs
  tabs={[{ label: 'En attente', count: 3 }, { label: 'Acceptées' }]}
  active={tab}
  onChange={setTab}
/>
```

Barre scrollable (`overflow-x`), compteur rendu « Label (n) », actif = trait 3px orange.

## Badge

```tsx
<Badge>Expire dans 5 jours</Badge>                 // neutral : 400, bleu
<Badge variant="success">Acceptée</Badge>          // 700 vert
<Badge variant="danger">3 pers. pour 2 places</Badge> // 700 rouge
<Badge variant="warning">Question posée</Badge>    // bord orange, texte bleu 700
```

## Card

```tsx
<Card accentTop="brand">…</Card>   // bord haut 6px : brand #003a5d · success · warning
```

Blanche, bordure hairline, padding 16px (surcharger par `className` si besoin).
Toutes les props de `<div>` passent.

## Avatar

```tsx
<Avatar name="Marie Lefèvre" size={34} />  // « ML » · « 1re Nancy » → « 1N »
```

Carré `#ebeff2`, initiales 800 (taille auto : 11/12/13px selon `size` 32/34/44).
`initialsOf(name)` est exporté.

## Stepper

```tsx
<Stepper step={1} />          // « Étape 1 sur 2 », carré courant orange
<Stepper step={2} total={2} />
```

## EmptyState · SuccessPanel · PageTitle · SectionTitle · HelpText

```tsx
<EmptyState>Aucune demande refusée.</EmptyState>
<SuccessPanel><p className="text-body"><b>Demande envoyée !</b> …</p></SuccessPanel>
<PageTitle>Mes demandes,</PageTitle>      // h1 Caveat 36px — FINIT par une virgule
<SectionTitle>Mes couchages,</SectionTitle> // h2 Caveat 24px
<HelpText>Seul le quartier de chaque logement est affiché.</HelpText>
```

`SuccessPanel` : carte bord haut 6px vert + fade. Les titres Caveat finissent par une
virgule (signature de la charte), sauf interrogatifs (« Où dormiras-tu ? »).

## SigneImage

```tsx
<SigneImage name="tente" size={64} opacity={0.45} />
```

`name: 'fleche' | 'tente' | 'etoile' | 'campement' | 'paix' | 'soleil' | 'promesse'`,
`size` = hauteur px (22 nav, 24–30 vignettes, 44–64 médias), `opacity` 0.45 en
substitut de photo sur fond `#ebeff2`. Alt vide (décoratif).

## Loading

```tsx
<Loading />   // « Chargement… » centré, sobre — utilisé par les guards
```

## cx

```tsx
cx('chip', active && 'chip--active', className)  // concatène en ignorant les falsy
```

## Hors kit, mais à connaître

- `src/lib/access-criteria.ts` : `ACCESS_CRITERIA_LABELS` — libellés français des
  8 critères d'accessibilité (profil bénévole ET formulaire logement 2/2).
- `src/lib/assets.ts` : `assetUrl(name)` — résout les fichiers de `eventConfig.assets`.
- `src/lib/hooks.ts` : `useMe()` (`me`, `isAnonymous`), `useSetMe()` (pousser un profil
  frais après PATCH/onboarding), `useLogout()`.
- Tout texte propre à l'ÉVÉNEMENT vient de `@repo/event-config` (jamais en dur).

## AddressAutocomplete

```tsx
interface AddressValue { label: string; city: string; postcode: string; lat: number; lng: number }
<AddressAutocomplete
  label="Adresse"
  glose="obligatoire"
  value={address}            // AddressValue | null — null tant que rien n'est CHOISI dans la liste
  onChange={setAddress}
  initialQuery={listing?.addressFull}  // édition : pré-remplit le champ sans valeur
/>
```

BAN (api-adresse.data.gouv.fr), debounce 300 ms, min 3 caractères. La saisie libre ne
produit JAMAIS de valeur : exiger `value !== null` avant submit (création) ; en édition,
`value === null` = adresse inchangée (le PATCH accepte un body sans `address`).
