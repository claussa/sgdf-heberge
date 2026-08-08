# Tokens de la charte SGDF (référence)

Copies de référence des tokens du design system « charte-sgdf-pape-2026 » du projet
claude.ai/design. **Ne pas importer directement dans l'app** : la SPA a sa propre version
adaptée dans `apps/web/src/styles/tokens.css` (fontes via @fontsource, chemins d'assets Vite).

`fonts.css` du design system n'est pas copié : il référençait des woff2 locaux au projet
design ; l'app utilise les packages `@fontsource/raleway`, `@fontsource/sarabun`,
`@fontsource/caveat-brush` (mêmes fichiers Google Fonts, auto-hébergés au build — RGPD).

Règles d'usage (readme charte) : bleu institutionnel #003a5d partout, couleurs secondaires en
touches seulement, angles carrés (radius 0 ; 3px inputs), filets 1px plutôt qu'ombres,
signes PNG comme seule iconographie (pas de lib d'icônes, pas d'emoji), tutoiement,
titres Caveat Brush, texte courant Sarabun bleu sur clair / blanc sur foncé.
