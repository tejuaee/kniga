import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { useLog } from '../log-context';
import { api } from '../api';
import { Logo } from './Logo';
import { PlusIcon, SearchIcon } from './Icons';

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
            <NavLink to="/" end>Home</NavLink>
            <NavLink to="/diary">Diary</NavLink>
            {user && <NavLink to={`/u/${user.username}`}>Profile</NavLink>}
          </nav>
        </div>
        <div className="nav__right">
          <NavSearch />
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
                <NavLink to={`/u/${user?.username}`} role="menuitem" onClick={() => setMenu(false)}>Profile</NavLink>
                <NavLink to="/diary" role="menuitem" onClick={() => setMenu(false)}>Diary</NavLink>
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
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search books and members" />
    </form>
  );
}

function VerifyBanner({ email }: { email: string }) {
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
