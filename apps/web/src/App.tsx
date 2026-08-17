import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router'
import { RequireAdmin, RequireAuth, RequireOnboarded } from './guards'
import { AppLayout } from './layout/AppLayout'
import { useAnalyticsIdentity } from './lib/hooks'
import { Admin } from './pages/Admin'
import { AdminAdmins } from './pages/AdminAdmins'
import { AdminLogements } from './pages/AdminLogements'
import { Aide } from './pages/Aide'
import { Connexion } from './pages/Connexion'
import { Dispatcher } from './pages/Dispatcher'
import { HebergeurDemandes } from './pages/HebergeurDemandes'
import { HebergeurLogementNouveau } from './pages/HebergeurLogementNouveau'
import { HebergeurLogements } from './pages/HebergeurLogements'
import { Inscription } from './pages/Inscription'
import { Jumelage } from './pages/Jumelage'
import { JumelageFiche } from './pages/JumelageFiche'
import { Logement } from './pages/Logement'
import { MentionsLegales } from './pages/MentionsLegales'
import { MesDemandes } from './pages/MesDemandes'
import { ProfilHebergeur } from './pages/ProfilHebergeur'
import { ProfilUnite } from './pages/ProfilUnite'
import { ProfilVolontaire } from './pages/ProfilVolontaire'
import { Recherche } from './pages/Recherche'
import { UniteAnnonce } from './pages/UniteAnnonce'
import { UniteRelations } from './pages/UniteRelations'
import { Loading } from './ui'
import './pages/pages.css'

// Chargée à la demande : la page embarque les templates de packages/emails et le
// moteur de rendu react-email — inutile dans le bundle critique de la SPA.
const CommentCaMarche = lazy(() =>
  import('./pages/CommentCaMarche').then((m) => ({ default: m.CommentCaMarche })),
)

/**
 * Router de la SPA. Tout passe par AppLayout (chrome A.0). Les écrans profil
 * (/profil, /hebergeur, /unite) ne sont PAS derrière RequireOnboarded : c'est là
 * que se fait l'onboarding (accountType null autorisé).
 */
export function App() {
  useAnalyticsIdentity()
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/connexion" element={<Connexion />} />
        <Route path="/mentions-legales" element={<MentionsLegales />} />
        <Route path="/aide" element={<Aide />} />
        <Route
          path="/comment-ca-marche"
          element={
            <Suspense fallback={<Loading />}>
              <CommentCaMarche />
            </Suspense>
          }
        />
        <Route path="/" element={<Dispatcher />} />
        <Route element={<RequireAuth />}>
          <Route path="/inscription" element={<Inscription />} />
          <Route path="/profil" element={<ProfilVolontaire />} />
          <Route path="/hebergeur" element={<ProfilHebergeur />} />
          <Route path="/unite" element={<ProfilUnite />} />
          <Route element={<RequireOnboarded />}>
            <Route path="/recherche" element={<Recherche />} />
            <Route path="/logements/:id" element={<Logement />} />
            <Route path="/mes-demandes" element={<MesDemandes />} />
            <Route path="/hebergeur/demandes" element={<HebergeurDemandes />} />
            <Route path="/hebergeur/logements" element={<HebergeurLogements />} />
            <Route path="/hebergeur/logements/nouveau" element={<HebergeurLogementNouveau />} />
            <Route
              path="/hebergeur/logements/:id/modifier"
              element={<HebergeurLogementNouveau />}
            />
            <Route path="/jumelage" element={<Jumelage />} />
            <Route path="/jumelage/:adId" element={<JumelageFiche />} />
            <Route path="/unite/annonce" element={<UniteAnnonce />} />
            <Route path="/unite/relations" element={<UniteRelations />} />
          </Route>
          <Route element={<RequireAdmin />}>
            <Route path="/admin" element={<Admin />} />
            <Route path="/admin/logements" element={<AdminLogements />} />
            <Route path="/admin/administrateurs" element={<AdminAdmins />} />
          </Route>
        </Route>
        {/* Chemin inconnu : le dispatcher renvoie vers l'écran pertinent */}
        <Route path="*" element={<Dispatcher />} />
      </Route>
    </Routes>
  )
}
