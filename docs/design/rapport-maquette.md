# Rapport d'analyse — Maquette hi-fi « Plateforme hébergement »

> Source : `docs/design/maquette-hifi.html` (fichier design-canvas React : template `<x-dc>` +
> `<script data-dc-script>` avec l'état et les données de démo). Ce rapport est la **spec UI de
> référence** : le wording français est à reprendre à l'identique (une seule correction :
> « valable 30 minutes, un seul usage » → « valable 10 minutes », cf. CLAUDE.md §9).
> Le bandeau de dev (sélecteur de personas + toggle Ordi/Mobile) est un outil de prototypage,
> à NE PAS implémenter.

## Avertissement

**Aucun écran admin dans la maquette** (à concevoir sobrement avec les composants charte).
3 personas réels : bénévole (Marie), hébergeur (Claire), unité (1re Nancy).

---

# A. INVENTAIRE DES ÉCRANS

## A.0 — Chrome global

### Frame
- Desktop : `width: min(1280px,100%)`, mobile : `390px`. `min-height: 780px`, fond blanc, bordure
  `1px solid rgba(0,58,93,.16)`.

### Header desktop
- `padding:0 40px`, `border-bottom:1px solid rgba(0,58,93,.16)`, `gap:28px`.
- Logo `sgdf-horizontal-blue.png` (alt « Scouts et Guides de France »), hauteur 38px.
- Bloc titre 2 lignes : **« Hébergement »** (Caveat Brush 22px #003a5d) +
  **« Léon XIV · France 2026 · 25-28 septembre »** (Sarabun 700 9.5px, uppercase,
  letter-spacing .12em, #66899e).
- Connecté : nav horizontale + avatar carré 34×34 fond #ebeff2 avec initiales + nom.
- Non connecté : lien **« Se connecter »** (souligné orange #ff8300).

### Header mobile
- `padding:10px 16px`, logo `sgdf-symbole-blue.png` 28px + titre d'écran Caveat Brush 24px +
  avatar 32×32 si connecté.
- Titres d'écran mobile : Connexion · Inscription · Mon profil · Rechercher · Logement ·
  Mes demandes · Demandes reçues · Mes logements · Nouveau logement · Notre unité ·
  Notre annonce · Jumelage · Unité · Demandes. Fallback « Hébergement ».

### Bottom nav mobile (connecté uniquement)
- `position:sticky; bottom:0`, fond blanc, border-top, items `flex:1`, icône PNG 22px + libellé
  700 10px uppercase. Actif = `border-top:3px solid #ff8300` + opacity 1 (inactif .55).
- Absente sur connexion et inscription.

### Padding contenu
`0` sur connexion, sinon `24px 16px 48px` (mobile) / `40px 48px 72px` (desktop). Pas de footer.

---

## A.1 — Connexion (public)
Desktop : grille `420px 1fr` ; mobile : empilé.

**Panneau gauche bleu #003a5d** (`padding:36px 56px 36px 36px`, min-height 360px) :
- Logo `sgdf-vertical-white.png` (96px)
- Titre : **« Un toit pour chaque bénévole, »** (Caveat Brush 46px blanc, max-width 360px)
- Texte : **« Trouver où dormir — ou accueillir ceux qui viennent — pour la venue du pape
  Léon XIV, du 25 au 28 septembre 2026. »**
- Desktop only : `papier-dechire-vertical.png` en séparateur vertical (`position:absolute;
  left:100%; margin-left:-14px; height:100%; width:32px; object-fit:fill`).

**Panneau droit** (`padding:48px 36px`, contenu max-width 400px centré) :
- Image `pape-leon-xiv-france-2026.png` (88px, alt « Léon XIV France 2026 »)
- Titre : **« Connecte-toi en un clic, »**
- Texte : **« On t'envoie un lien de connexion. Pas de mot de passe à retenir, pas de compte à
  créer avant. »**
- Label **« E-mail »** + champ (min-height 44px)
- Bouton primaire : **« Recevoir mon lien »**
- État envoyé — carte succès (bord supérieur 6px #007254) : **« Le lien est parti ! Vérifie ta
  boîte mail : il est valable 10 minutes. »** (« Le lien est parti ! » en gras)
- Note : **« Première visite ? Le lien crée ton compte, tout simplement. »**

## A.2 — Inscription (post-login, accountType null)
Colonne `max-width:640px`. Cartes en grille `1fr 1fr` desktop / `1fr` mobile.

- Titre : **« Je m'inscris comme… »**
- Carte radio 1 : **« Bénévole individuel »** / **« Seul ou en petit groupe : je cherche où
  dormir, ou je propose un logement. »**
- Carte radio 2 : **« Unité scoute »** / **« Jumelage : nous cherchons une unité sur place, ou
  nous pouvons en accueillir une. »**
- Sélection = bordure `2px solid #003a5d` (sinon `1px solid rgba(0,58,93,.3)`) + point plein.
- Bénévole sélectionné → 2 boutons primaires (fade) : **« Je cherche un logement »** (→ profil
  bénévole) et **« Je propose un logement »** (→ profil hébergeur).
- Unité sélectionnée → bouton **« Continuer »** (→ profil unité).
- Note : **« Tu pourras ajouter un autre rôle plus tard, depuis ton profil, sans refaire de
  compte. »**

## A.3 — Profil bénévole
Colonne `max-width:560px`, gap 16px. Grille interne `1fr 1fr` / `1fr`.

- Titre : **« Bénévole individuel, »**
- Champ désactivé : **« E-mail — déjà connu par la connexion »**
- **« Prénom et nom »** · **« Nous serons »** (ex. `3 personnes`) ·
  **« Téléphone — transmis avec la demande »**
- Groupe **« Mes besoins d'accessibilité »** — cases à cocher (v1 : les 8 critères de la grille,
  la maquette n'en montrait que 3 : fauteuil roulant / peu d'obstacles / calme)
- Bouton primaire (min-width 220px) : **« Enregistrer et rechercher »**
- Séparateur + label **« Et si besoin »**
- Bouton secondaire : **« Proposer aussi un logement »**
- Note : **« Ça ouvre ton espace hébergeur, en plus de celui-ci — même compte, même connexion. »**

## A.4 — Recherche (bénévole)
Grille résultats `repeat(auto-fill, minmax(270px,1fr))`, gap 20px.

- Titre : **« Où dormiras-tu ? »**
- Barre de filtres (fond #f5f7f8, bordure, padding 16px, 2 lignes) :
  - Ligne 1 : label **« Site »** + chips Paris/Lourdes/Metz (actif = fond #003a5d) + champ
    dates·personnes **« 25 → 28 sept. · 3 personnes »**
  - Ligne 2 : label **« Type »** + chips **« Canapé » « Couchage sommaire » « Chambre privée »
    « Tente » « Hôtel » « Gymnase »** (+ v1 : filtre « Compatibles avec mes besoins »)
- Compteur : **« {n} logements »** (nombre en gras)
- Cartes logement (cf. C.2). Fixtures : Chambre privée · 2 places (Paris 12e, badge « Accessible
  fauteuil roulant », icône tente) · Couchage sommaire · 4 places (Montreuil, campement) ·
  Emplacement tente · 6 places (Vincennes, « Environnement calme », soleil) · Canapé · 2 places
  (Paris 11e, etoile) · Hôtel Ibis Nation · chambres (Paris 12e, « Payant · 45 € · code
  PAPE15 », promesse) · Gymnase Léo-Lagrange (Paris 12e, « Couchage collectif », paix)
- Note : **« Seul le quartier de chaque logement est affiché. L'adresse complète t'est transmise
  quand l'hébergeur accepte ta demande. »**

## A.5 — Fiche logement (bénévole)
Desktop : grille `1.6fr 1fr` gap 32px ; mobile : `1fr`. Lien **« ← Retour à la recherche »**.

**Colonne gauche :**
- Bloc image 280px fond #ebeff2 avec signe 64px opacité .45
- Titre : **« Chambre privée · 2 places, »**
- Sous-titre : **« Paris 12e — quartier seulement · disponible du 24 au 29 septembre · chez
  Claire M. »**
- Badges accessibilité : **« Accessible fauteuil roulant » « Facile d'accès en transports »
  « Environnement calme »**
- Description entre guillemets français : **« Chambre au 1er étage avec ascenseur, lit double.
  Arrivée possible à partir de 18 h, petit-déjeuner partagé. Trois marches dans le hall, puis
  ascenseur de 70 cm. »**

**Colonne droite — panneau demande (bord supérieur 6px #003a5d, padding 20px) :**
- Titre : **« Ma demande, »** (Caveat Brush 26px)
- Label **« Dates et personnes »** → **« 25 → 28 sept. · 3 personnes »**
- Alerte rouge #d03f15 : **« Attention : vous êtes 3 pour 2 places. Claire pourra accepter ou
  refuser. »**
- Label **« Un message pour Claire »** + textarea (min-height 88px), placeholder : **« Qui vous
  êtes, sur quel service vous êtes bénévoles… »**
- Bouton primaire : **« Envoyer ma demande »**
- État envoyé — carte succès : **« Demande envoyée ! Claire a 7 jours pour répondre. Tu seras
  prévenue par e-mail. »** + bouton secondaire **« Suivre mes demandes »**
- Note : **« Ton numéro est transmis avec la demande. Tu ne peux pas écrire à Claire en dehors de
  cette demande : c'est elle qui te contacte. »**

Variantes v1 (hors maquette, actées) : **hôtel** = pas de panneau demande → bloc prix/code promo
+ bouton primaire vers `bookingUrl` (« Réserver sur le site de l'hôtel ») ; **gymnase** = panneau
demande standard + prix affiché.

## A.6 — Mes demandes (bénévole)
Colonne `max-width:760px`.

- Titre : **« Mes demandes, »**
- Bandeau quota (carte, bord supérieur 6px #ff8300) : **« 3 sollicitations en attente sur 3.
  Pour en envoyer une autre, annule ou attends une réponse. »** (1re phrase en gras)
- Onglets : **« En attente (3) » « Acceptées » « Refusées » « Expirées »**

**En attente :**
1. Badges **« Envoyée il y a 2 jours » « Expire dans 5 jours »** ; **« Chambre chez Claire ·
   Paris 12e · 25-28 sept. · 3 personnes »** ; bouton **« Annuler ma demande »**
2. Carte bord orange : badge orange 700 **« Question posée »** + **« Délai remis à 7 jours »** ;
   **« Couchage sommaire · Montreuil »** ; **« "Vous arrivez avant 20 h ?" — à toi de
   répondre. »** ; boutons **« Répondre »** (primaire) + **« Annuler ma demande »**
3. Badge **« Expire demain »** ; **« Emplacement tente · Vincennes — relance envoyée à
   l'hébergeur chaque jour. »** ; **« Annuler ma demande »**
- Note : **« Dès qu'un hébergeur accepte, tes autres demandes en attente sont annulées
  automatiquement et les hébergeurs concernés sont prévenus. »**

**Acceptées :** carte bord vert : badge vert **« Acceptée »** ; **« Chambre chez Claire ·
25-28 sept. · 3 personnes »** ; bloc coordonnées : **« Claire Martin »** / tél · email /
adresse complète ; bouton **« Annuler ma réservation »** ; note : **« L'adresse complète et les
coordonnées n'apparaissent qu'ici, après acceptation. L'annulation reste possible des deux
côtés ; chacun est prévenu par e-mail. »**

**Refusées (vide) :** **« Aucune demande refusée. »**
**Expirées (vide) :** **« Aucune demande expirée. Sans réponse au bout de 7 jours, une demande
expire et libère une de tes 3 sollicitations. »**

## A.7 — Profil hébergeur
Colonne `max-width:560px`.

- Titre : **« J'accueille des bénévoles, »**
- Champ désactivé **« E-mail — déjà connu par la connexion »** · **« Prénom et nom »** ·
  **« Téléphone »**
- Note : **« Ton numéro n'est transmis au bénévole qu'après ton acceptation. »**
- Bouton primaire (min-width 240px) : **« Créer mon premier logement »**
- Séparateur + **« Et si besoin »** + bouton secondaire : **« Chercher aussi un logement,
  ailleurs »**
- Note : **« Ça ouvre ton espace bénévole, en plus de celui-ci — même compte, même connexion. »**

(Pas de « Nous serons » ni de besoins d'accessibilité côté hébergeur.)

## A.8 — Demandes reçues (hébergeur)
Colonne `max-width:760px`.

- Titre : **« Demandes reçues, »**
- Onglets : **« En attente (2) » « Acceptées » « Refusées » « Expirées »**

**En attente :**
- Carte demande : avatar 44×44 initiales ; **« Marie Lefèvre · 3 personnes — 25 au 28
  septembre »** ; message du demandeur ; **« 06 98 76 54 32 — c'est à toi de la contacter : elle
  ne peut pas t'écrire en dehors de sa demande. »** (numéro en gras) ; badges **« Besoin :
  fauteuil roulant »** (neutre) + **« 3 pers. pour 2 places »** (rouge 700) + **« Expire dans
  6 jours »** ; boutons **« Accepter »** (primaire) **« Poser une question »** **« Refuser »**
- Après accept — carte verte : badge **« Acceptée »** ; **« Coordonnées échangées : Marie reçoit
  ton adresse complète et ton téléphone, ses deux autres demandes sont annulées
  automatiquement. »**
- Carte 2 : **« Thomas Renard · seul — question posée hier, délai remis à 7 jours. »**
- Séparateur + label **« Disponibilité de mon logement »** + chips **« Libre » / « Complet »**
- Note : **« Passer en "complet" sort le logement des recherches sans rien annuler. Sans action
  pendant 7 jours, la demande expire et le logement est masqué automatiquement. »**

États vides : **« Aucune demande acceptée pour l'instant. » « Aucune demande refusée. »
« Aucune demande expirée. »**

## A.9 — Mes logements (hébergeur)
Colonne `max-width:760px`.

- Titre : **« Mes logements, »**
- Carte ligne : vignette 96×72 #ebeff2 + signe 30px ; **« Chez Claire — 2 chambres, 1 canapé,
  2 couchages »** ; **« Paris 12e · 8 personnes · disponible du 24 au 29 septembre »** ; chips
  **« Libre » / « Complet »** ; bouton **« Modifier »**
- Bouton secondaire : **« + Ajouter un logement »**
- Note : **« Tu peux avoir plusieurs logements, et passer chacun en "complet" à tout moment. »**
- v1 : si masqué (hiddenAt) → bandeau + bouton « Réactiver ».

## A.10 — Nouveau logement 1/2 (hébergeur)
Colonne `max-width:760px` ; grille haut `1fr 1fr 1fr` / `1fr` ; tableau couchages
`overflow-x:auto` min-width 560px.

- Stepper : 2 carrés 10×10 (actif #ff8300, inactif #ccd7df) + **« Étape 1 sur 2 »**
- Titre : **« Décris ton logement, »**
- **« Site le plus proche »** (select, ▾) · **« Capacité — calculée »** (désactivé, ex.
  `8 personnes`) · **« Disponible »** (ex. `24 → 29 sept.`)
- Sous-titre : **« Mes couchages, »** (Caveat Brush 24px)
- Tableau : en-têtes **« Type »** (flex:2) **« Combien »** (70px) **« Personnes »** (100px)
  **« Précision »** (flex:2). Fixtures : Chambre privée/2/2 chacune/1er étage, ascenseur ·
  Canapé/1/2/salon · Couchage sommaire/2/1 chacun/matelas au sol. Types du select : Chambre
  privée · Canapé · Couchage sommaire · Emplacement tente.
- Bouton secondaire : **« + Ajouter un couchage »**
- Note : **« La capacité affichée est la somme des couchages déclarés. »**
- **« Adresse — obligatoire »** : autocomplete (suggestions BAN, 1re surlignée #ebeff2 gras).
  Note : **« Adresse choisie dans une liste : ville, code postal et distance au site se
  remplissent seuls. Seul le quartier est affiché publiquement — l'adresse complète part au
  bénévole quand tu acceptes sa demande. »**
- **« Description libre »** : textarea placeholder **« Horaires d'arrivée, animaux,
  petit-déjeuner, ce qu'il faut apporter… »**
- (Photos : différées en V2 — ne pas implémenter le bloc « Photos » de la maquette.)
- Bouton primaire (min-width 200px) : **« Continuer »**

## A.11 — Nouveau logement 2/2 (hébergeur)
- Stepper : **« Étape 2 sur 2 »**
- Titre : **« Accessibilité de ton logement, »**
- Intro : **« Coche seulement ce qui est vrai chez toi. Ce qui n'entre pas dans une case se dit
  dans le champ libre. »**
- Grille de cases `1fr 1fr` / `1fr` — v1 : les **8 critères** du cadrage (libellé gras +
  précision) :
  1. **« Accessible en fauteuil roulant »** — « aucune marche, passages larges, sanitaires adaptés »
  2. **« Fauteuil roulant électrique »** — « lieu de recharge avec un espace suffisant »
  3. **« Peu d'obstacles »** — « quelques marches, pas de long escalier »
  4. **« Aide humaine possible, soin à proximité »** — « possibilité d'aide, centre de soin proche »
  5. **« Facile d'accès en transports »** — « transports et commerces accessibles »
  6. **« Stationnement à proximité »** — « dépose ou place PMR proche de l'entrée »
  7. **« Chien d'assistance accepté »**
  8. **« Environnement calme »** — « cadre apaisant (handicap sensoriel, cognitif) »
- **« Autres informations d'accessibilité »** : textarea (ex. « Trois marches dans le hall, puis
  ascenseur de 70 cm. »)
- Bouton primaire (min-width 220px) : **« Publier mon logement »**
- Note : **« Tu pourras ajouter d'autres logements depuis ton compte, et passer chacun en
  "complet" à tout moment. »**

## A.12 — Profil unité
Colonne `max-width:560px`.

- Titre : **« Unité scoute, »**
- **« Unité »** (ex. `1re Nancy · Pionniers-Caravelles` — v1 : champ nom + select branche) ·
  champ désactivé **« E-mail de l'unité — déjà connu par la connexion »** · **« Téléphone du
  responsable »**
- Groupe radio **« Notre annonce »** : **« Nous cherchons un jumelage sur place »** (défaut,
  « cherchons » en gras) / **« Nous pouvons jumeler une unité qui vient chez nous »**
  (« pouvons jumeler » en gras)
- Bouton primaire : **« Continuer »**
- Note : **« Pas de réservation dans ce parcours : uniquement une mise en relation. E-mail et
  téléphone sont échangés après acceptation. »**

## A.13 — Notre annonce (unité)
Colonne `max-width:560px` ; grille `1fr 1fr` / `1fr`. Contenu selon le sens.

- Titre : **« Notre annonce de jumelage, »** (cherchons) / **« Nous pouvons jumeler, »** (pouvons)
- **« Site »** (select) · **« Dates »** (ex. `25 → 28 sept.`)
- Label variable : **« Nous serons »** (ex. `18 jeunes + 3 chefs`) / **« Jusqu'à »** (ex.
  `30 personnes`)
- **« Un mot sur notre projet »** : textarea placeholder **« Quelques lignes libres : notre
  service, notre tranche d'âge, ce que nous cherchons… »**
- Bouton primaire : **« Publier l'annonce »**
- Note : **« Rien à décrire côté logement : c'est aux deux unités de s'entendre sur le lieu une
  fois en contact — local scout, hébergement chez les familles… »**

## A.14 — Jumelage (liste, unité)
Colonne `max-width:680px`.

- Titre : **« Jumelage à {Site}, »**
- Onglets : **« Unités à jumeler »** (actif) / **« Notre annonce »**
- Compteur : **« {n} unités · {Site}, 25-28 septembre »** ({n} en gras — utiliser le vrai compte)
- Cartes unité : vignette 44×44 signe paix + **nom** + branche + ligne 2 (ex. **« Peut jumeler
  jusqu'à 25 personnes · 24-29 sept. »**) + **« Voir → »** (#0077b3)
- Note : **« La recherche marche dans les deux sens : une unité qui peut jumeler voit la liste
  des unités qui cherchent. Même écran, même bouton. »**

## A.15 — Fiche unité
Colonne `max-width:560px`. **« ← Retour au jumelage »**

- Titre : **« {Nom de l'unité}, »**
- Sous-titre : **« Scouts-Guides · Metz · peut jumeler jusqu'à 30 personnes du 24 au 29
  septembre »**
- Citation (description) entre guillemets : **« Nous connaissons bien le quartier et pouvons vous
  aider à trouver où dormir. »**
- Label **« Demander une mise en relation »** + textarea placeholder **« Qui nous sommes, ce que
  nous venons faire… »**
- Bouton primaire : **« Demander à être mis en relation »**
- État envoyé — carte verte : **« Demande envoyée ! Si {Nom} accepte, vous recevez chacun
  l'e-mail et le téléphone de l'autre, et vous vous organisez entre unités. »**
- Note : **« Une demande non acceptée reste simplement sans suite : ni refus, ni expiration. »**

## A.16 — Demandes de mise en relation (unité)
Colonne `max-width:680px`.

- Titre : **« Demandes de mise en relation, »**
- Onglets : **« Reçues (1) » / « En relation (2) »**

**Reçues :** carte : **« 2e Épinal · Scouts-Guides — 16 personnes, 24 au 29 septembre »** ;
message ; boutons **« Accepter et échanger nos contacts »** (primaire) + **« Ignorer »**.
Après accept — carte verte : badge **« En relation »** ; **« 2e Épinal · Lucas Perrin »** /
email · tél ; **« La plateforme s'arrête là : le lieu, le planning et l'organisation se règlent
entre les deux unités. »**
Carte annonce : **« Notre annonce est toujours en ligne. »** + bouton **« Retirer notre
annonce »**.
Note : **« Ni refus ni expiration : une demande non acceptée reste sans suite, et le seul bouton
de sortie est "retirer l'annonce". Une unité peut être jumelée plusieurs fois. »**

**En relation :** cartes vertes : badge **« En relation »** + nom unité · contact / email · tél.

---

# B. RÈGLES FONCTIONNELLES RÉVÉLÉES (rappel)

1. **Dates** : plage libre affichée « 24 → 29 sept. » (séparateur `→`), saisie par plage,
   dépasse librement les dates de l'événement. Séparateur dates/personnes : `·`.
2. **Adresse** : quartier seul partout (« Paris 12e ») ; « chez {Prénom} {Initiale}. » ; adresse
   complète + coordonnées uniquement dans l'onglet Acceptées.
3. **Téléphone du demandeur** transmis immédiatement avec la demande côté hébergeur ; celui de
   l'hébergeur seulement après acceptation.
4. **Statuts** : En attente (+ sous-état « Question posée », badge orange, « Délai remis à
   7 jours ») · Acceptée · Refusée · Expirée. Annulée = pas d'onglet (sort des listes).
5. **Quota** : bandeau « 3 sollicitations en attente sur 3 » sur Mes demandes uniquement.
6. **Acceptation** → coordonnées échangées + annulation auto des autres demandes (les hébergeurs
   concernés sont prévenus).
7. **Inaction hébergeur 7 j** → demande expirée + logement masqué automatiquement.
8. **Jumelage** : accepter/ignorer seulement, multi-jumelage, retrait d'annonce = seule sortie ;
   coordonnées mutuelles (email + tél + nom) après accept.
9. **Navigation** (desktop long / mobile court / icône signe) :
   - Bénévole : Rechercher un logement/Rechercher/fleche · Mes demandes/Demandes/tente ·
     Mon profil/Profil/etoile
   - Hébergeur : Demandes reçues/Demandes/tente · Mes logements/Logements/campement ·
     Mon profil/Profil/etoile
   - Unité : Jumelage/Jumelage/paix · Demandes reçues/Demandes/tente · Notre annonce/Annonce/
     campement · Notre unité/Unité/etoile
   - États actifs : recherche reste actif sur fiche logement ; jumelage sur fiche unité ;
     logements sur création.
10. **Ton** : tutoiement (bénévole/hébergeur), « nous/notre » (unité), guillemets « », heures
    « 20 h », titres Caveat Brush terminés par une virgule (sauf interrogatifs).

---

# C. SYSTÈME VISUEL

## C.1 Palette (styles inline de la maquette)
#003a5d texte principal/boutons primaires/panneau hero · #ffffff fonds/texte sur bleu ·
#66899e texte secondaire · #33627d labels (uppercase 11px) · rgba(0,58,93,.16) bordure cartes ·
#ebeff2 fonds neutres/désactivés/avatars · rgba(0,58,93,.35) bordure inputs · #007254 succès ·
#00263d hover primaire · rgba(0,58,93,.3) bordure badges · #ff8300 accent (onglet/nav actif,
alerte quota, stepper) · #99b0be placeholders · #0077b3 liens · #f5f7f8 fond filtres ·
#d03f15 rouge alerte · #ccd7df stepper inactif · #e0e7ec fond hors frame.
**Aucun border-radius sauf 3px sur inputs. Aucune ombre.**

## C.2 Carte logement
article : fond blanc, border 1px rgba(0,58,93,.16), hover border #003a5d, cursor pointer.
Média 148px fond #ebeff2, signe en background center/auto 44px opacité .45.
Corps padding 14px gap 6px : titre Sarabun 700 15px #003a5d · ville 400 13px #66899e ·
badges wrap gap 6px.

## C.3 Badges
Neutre : border rgba(0,58,93,.3), 400 12px, #003a5d · Succès : border #007254, 700 12px,
#007254 · Alerte : border #d03f15, 700 12px, #d03f15 · Attention : border #ff8300, 700 12px,
#003a5d. Tous : padding 3px 10px, pas de radius, pas de fond.

## C.4 Cartes accentuées
`border-top:6px solid` : #007254 succès · #ff8300 quota/question · #003a5d panneau demande.

## C.5 Formulaires
Label : Sarabun 700 11px, letter-spacing .08em, uppercase, #33627d, glose « — … ».
Input : border 1px rgba(0,58,93,.35), radius 3px, min-height 42px (44 login, 36 tableau,
34 filtres), padding 0 12px, Sarabun 400 14px #003a5d.
Désactivé : border rgba(0,58,93,.2), fond #ebeff2, texte #66899e.
Textarea : min-height 64/80/88px, padding 10px 12px, 400 13px/1.5.
Select : input + `▾` #66899e à droite.
Checkbox : carré 18×18 border 1.5px #003a5d, coché = carré plein 10×10.
Radio : rond 18×18, coché = disque 9×9.
Bouton primaire : #003a5d, blanc, min-height 46px (40 en carte), padding 0 24px, 700 14px,
hover #00263d.
Bouton secondaire : border 1.5px #003a5d, fond blanc, #003a5d, min-height 38-42px, 700 13px,
hover #ebeff2.
Chip : padding 6px 12px, 400 13px, border rgba(0,58,93,.35) ; actif fond #003a5d blanc.
Onglet : padding 10px 14px, 700 13px, nowrap ; actif #003a5d + border-bottom 3px #ff8300 ;
inactif #66899e ; barre en overflow-x:auto.
Stepper : carrés 10×10, actif #ff8300, inactif #ccd7df + « Étape N sur 2 ».

## C.6 Typographie
Caveat Brush : 46px hero · 36px H1 écran · 26px panneau · 24px sous-section/titre mobile ·
22px wordmark. Sarabun : 400 14px corps · 400 13px aide #66899e · 700 13-15px titres carte/
boutons · 700 11px uppercase labels · 700 9.5px uppercase eyebrow · 800 initiales avatar ·
700 10px uppercase nav mobile.

## C.7 Assets
Signes = substituts de photo (fond de vignette, opacité .45) + icônes nav mobile (22px).
7 signes : fleche, tente, etoile, campement, paix, soleil, promesse.
Logos : sgdf-horizontal-blue (header desktop 38px), sgdf-symbole-blue (header mobile 28px),
sgdf-vertical-white (hero 96px), pape-leon-xiv-france-2026 (connexion 88px).
Papier déchiré vertical : uniquement connexion desktop.

## C.8 Responsive
Un breakpoint ~768px. Mobile 390px de référence. Grilles `1fr 1fr`→`1fr`, login `420px 1fr`→`1fr`,
fiche `1.6fr 1fr`→`1fr`. Tableau couchages et barres d'onglets en overflow-x:auto.
Animation d'entrée : `fade .22s cubic-bezier(.2,.6,.2,1) both`
(`@keyframes fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}`).

---

# D. FIXTURES (seed)

- **Marie Lefèvre** — marie.lefevre@exemple.fr · 06 98 76 54 32 · 3 personnes · besoin fauteuil
  roulant · initiales ML
- **Claire Martin** — claire@exemple.fr · 06 12 34 56 78 · 12 rue des Boulets, 75012 Paris ·
  initiales CM
- **Thomas Renard** — demandeur seul, question posée hier
- **1re Nancy** — Pionniers-Caravelles · 1nancy@exemple.fr · 06 77 88 99 00 · SEEKING Metz ·
  « 18 jeunes + 3 chefs »
- Unités HOSTING Metz : 1re Woippy (Pionniers-Caravelles, jusqu'à 25, 24-29 sept.) · 3e Metz
  Saint-Éloy (Scouts-Guides, jusqu'à 30, 25-28 sept., « Nous connaissons bien le quartier et
  pouvons vous aider à trouver où dormir. ») · Groupe Sainte-Ségolène (Scouts-Guides, jusqu'à 12)
- Relations acceptées : 3e Metz Saint-Éloy · Paul Girard (saint.eloy@exemple.fr ·
  06 22 33 44 55) · 1re Verdun · Anne Petit (verdun@exemple.fr · 06 11 22 33 44)
- Contact reçu : 2e Épinal · Lucas Perrin (2epinal@exemple.fr · 06 44 55 66 77) · 16 personnes ·
  24 au 29 septembre · « Nous venons pour le service liturgie, nous avons notre matériel de
  cuisine. »
- Logement Claire : « Chez Claire » — chambres ×2 (2 chacune, 1er étage ascenseur) + canapé ×1
  (2, salon) + couchage sommaire ×2 (1 chacun, matelas au sol) = 8 personnes · Paris 12e ·
  24→29 sept. · description « Chambre au 1er étage avec ascenseur… » · accessibilité : fauteuil,
  peu d'obstacles, transports, calme + « Trois marches dans le hall, puis ascenseur de 70 cm. »
- Autres logements recherche : Couchage sommaire · 4 places (Montreuil) · Emplacement tente ·
  6 places (Vincennes, calme) · Canapé · 2 places (Paris 11e)
- Institutionnels (owner admin) : Hôtel Ibis Nation · chambres (Paris 12e, HOTEL, priceInfo
  « 45 € · code PAPE15 », bookingUrl) · Gymnase Léo-Lagrange (Paris 12e, COLLECTIVE, « Couchage
  collectif », prix admin)
- Demandes : Marie→Claire (PENDING, 3 pers., 25→28, message « Bonjour Claire, nous sommes trois
  bénévoles au service accueil, deux femmes et un homme, calmes et autonomes. », envoyée il y a
  2 j) · Marie→Montreuil (PENDING question « Vous arrivez avant 20 h ? » posée hier) ·
  Marie→Vincennes (PENDING, expire demain) · Thomas→Claire (PENDING question posée hier)
  — + variante acceptée pour la démo de l'onglet Acceptées.
