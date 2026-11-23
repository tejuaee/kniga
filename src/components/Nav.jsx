import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { useLog } from '../log-context';
import { api } from '../api';
import { Logo } from './Logo';
import { BellIcon, PlusIcon, SearchIcon } from './Icons';
import { NOTIFICATIONS_READ } from '../pages/Notifications';

export function Nav() {
  const { user, logout } = useAuth();
  const { openLog } = useLog();
  const navigate = useNavigate();
  const [menu, setMenu] = useState(false);

  return (
    <>
      <header className="nav">
        <div className="nav__left">
          <Logo />
          <nav className="nav__links">
            <NavLink to="/" end>
              Home
            </NavLink>
            <NavLink to="/diary">Diary</NavLink>
            {user && <NavLink to={`/u/${user.username}`}>Profile</NavLink>}
          </nav>
        </div>
        <div className="nav__right">
          <NavSearch />
          <NotificationBell />
          <button className="btn btn--primary btn--sm" onClick={() => openLog()}>
            <PlusIcon /> Log
          </button>
          <div className="user-menu">
            <button className="avatar" onClick={() => setMenu(!menu)} aria-haspopup="menu" aria-expanded={menu}>
              {user?.username[0].toUpperCase()}
            </button>
            {menu && (
              <div className="user-menu__pop" role="menu" onMouseLeave={() => setMenu(false)}>
                <p className="user-menu__name">{user?.username}</p>
                <NavLink to={`/u/${user?.username}`} role="menuitem" onClick={() => setMenu(false)}>
                  Profile
                </NavLink>
                <NavLink to="/diary" role="menuitem" onClick={() => setMenu(false)}>
                  Diary
                </NavLink>
                <button
                  role="menuitem"
                  onClick={async () => {
                    await logout();
                    navigate('/login');
                  }}
                >
                  Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      {user && !user.emailVerified && <VerifyBanner email={user.email} />}
    </>
  );
}

/** Bell with the number of unread notifications. Checks when you change page and once a minute. */
function NotificationBell() {
  const location = useLocation();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let alive = true;
    const check = () =>
      api('/notifications/unread-count')
        .then((r) => alive && setUnread(r.unread))
        .catch(() => {});
    check();
    const timer = setInterval(check, 60000);
    const cleared = () => setUnread(0);
    window.addEventListener(NOTIFICATIONS_READ, cleared);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener(NOTIFICATIONS_READ, cleared);
    };
  }, [location.pathname]);

  return (
    <NavLink
      to="/notifications"
      className="nav-bell"
      aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
    >
      <BellIcon size={20} />
      {unread > 0 && <span className="nav-bell__badge">{unread > 99 ? '99+' : unread}</span>}
    </NavLink>
  );
}

/** Compact search box; Enter opens the full results page. Hidden on the search page itself. */
function NavSearch() {
  const navigate = useNavigate();
  const location = useLocation();
  const [q, setQ] = useState('');
  if (location.pathname === '/search') return null;
  return (
    <form
      className="nav-search"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const query = q.trim();
        navigate(query ? `/search?q=${encodeURIComponent(query)}` : '/search');
        setQ('');
      }}
    >
      <SearchIcon />
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search"
        aria-label="Search books and members"
      />
    </form>
  );
}

function VerifyBanner({ email }) {
  const [sent, setSent] = useState(false);
  return (
    <div className="banner">
      Confirm your email — we sent a link to <strong>{email}</strong>.
      {sent ? (
        <span className="muted"> Sent again.</span>
      ) : (
        <button className="link-btn" onClick={() => api('/auth/resend-verification', 'POST').then(() => setSent(true))}>
          Resend link
        </button>
      )}
    </div>
  );
}
