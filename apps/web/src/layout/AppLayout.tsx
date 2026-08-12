import type { Me } from '@repo/contracts'
import { eventConfig } from '@repo/event-config'
import { Link, Outlet, useLocation } from 'react-router'
import { assetUrl } from '../lib/assets'
import { useMe } from '../lib/hooks'
import { Avatar, cx, SigneImage } from '../ui'
import { activeNavIndex, buildNav, screenTitle } from './navigation'
import './layout.css'

/** Nom affiché : l'unité pour les comptes SCOUT_UNIT, sinon « Prénom Nom ». */
function displayNameOf(me: Me): string | null {
  if (me.accountType === 'SCOUT_UNIT' && me.unitName) return me.unitName
  const name = [me.firstName, me.lastName].filter(Boolean).join(' ')
  return name === '' ? null : name
}

/**
 * Chrome global (A.0) : header desktop (logo, wordmark, nav, avatar), header
 * mobile (symbole, titre d'écran, avatar) et bottom nav mobile. Le contenu de la
 * route s'affiche dans <Outlet /> ; /connexion est rendu sans padding.
 */
export function AppLayout() {
  const { me } = useMe()
  const { pathname } = useLocation()
  const nav = buildNav(me)
  const active = activeNavIndex(nav, pathname)
  const mobileNav = nav.filter((item) => !item.desktopOnly)
  const name = me ? displayNameOf(me) : null
  const flush = pathname === '/connexion'

  return (
    <div className="frame">
      <header className="header-desktop">
        <img
          src={assetUrl(eventConfig.assets.logoHorizontal)}
          alt={eventConfig.organizer}
          className="header-desktop__logo"
        />
        <div className="header-desktop__wordmark">
          <span className="header-desktop__app">{eventConfig.appName}</span>
          <span className="header-desktop__eyebrow">{eventConfig.eyebrow}</span>
        </div>
        {nav.length > 0 && (
          <nav className="header-desktop__nav">
            {nav.map((item, index) => (
              <Link
                key={item.to}
                to={item.to}
                className={cx(
                  'header-desktop__link',
                  index === active && 'header-desktop__link--active',
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )}
        {me ? (
          <div className="header-desktop__account">
            <Avatar name={name ?? me.email} size={34} />
            {name && <span className="header-desktop__name">{name}</span>}
          </div>
        ) : (
          <Link to="/connexion" className="header-desktop__login">
            Se connecter
          </Link>
        )}
      </header>

      <header className="header-mobile">
        <img
          src={assetUrl(eventConfig.assets.logoSymbole)}
          alt={eventConfig.organizer}
          className="header-mobile__logo"
        />
        <span className="header-mobile__title">{screenTitle(pathname)}</span>
        {me && <Avatar name={name ?? me.email} size={32} className="header-mobile__avatar" />}
      </header>

      <main className={cx('content', flush && 'content--flush')}>
        <Outlet />
      </main>

      <footer className="footer">
        <span className="footer__org">© {eventConfig.organizer}</span>
        <Link to="/comment-ca-marche" className="footer__link">
          Comment ça marche
        </Link>
        <Link to="/mentions-legales" className="footer__link">
          Mentions légales
        </Link>
      </footer>

      {mobileNav.length > 0 && (
        <nav className="bottom-nav">
          {mobileNav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cx(
                'bottom-nav__item',
                nav.indexOf(item) === active && 'bottom-nav__item--active',
              )}
            >
              <span className="bottom-nav__icon">
                <SigneImage name={item.signe} size={22} />
              </span>
              <span className="bottom-nav__label">{item.short}</span>
            </Link>
          ))}
        </nav>
      )}
    </div>
  )
}
