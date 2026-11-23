import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { useLog } from '../log-context';
import { Cover } from '../components/Cover';
import { Stars } from '../components/Stars';
import { ActivityFeed } from '../components/ActivityFeed';
import { ChevronIcon, HeartIcon, PlusIcon, RepeatIcon, ReviewIcon } from '../components/Icons';

const RECENT_LIMIT = 10;

export function Home() {
  const { user } = useAuth();
  const { openLog, version } = useLog();
  const [entries, setEntries] = useState(null);
  const [total, setTotal] = useState(0);
  const row = useRef(null);

  useEffect(() => {
    api(`/logs?limit=${RECENT_LIMIT}`)
      .then((r) => setEntries(r.entries))
      .catch(() => setEntries([]));
    api('/logs?limit=500')
      .then((r) => setTotal(r.entries.length))
      .catch(() => {});
  }, [version]);

  const scroll = (dir) => {
    const el = row.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth, behavior: 'smooth' });
  };

  return (
    <div className="page">
      <section className="hello">
        <div>
          <p className="eyebrow">Your shelves</p>
          <h1 className="serif-title serif-title--xl">Welcome back, {user?.username}.</h1>
          <p className="lead">
            {total ? `You've logged ${total} ${total === 1 ? 'book' : 'books'}. ` : ''}What are you reading now?
          </p>
        </div>
        <button className="btn btn--primary" onClick={() => openLog()}>
          <PlusIcon /> Log a book
        </button>
      </section>

      <section className="card-section">
        <div className="section-head">
          <h2 className="section-title">Recent Logs</h2>
          <div className="section-head__right">
            {entries && entries.length > 4 && (
              <>
                <button className="round-btn" onClick={() => scroll(-1)} aria-label="Scroll left">
                  <ChevronIcon dir="left" />
                </button>
                <button className="round-btn" onClick={() => scroll(1)} aria-label="Scroll right">
                  <ChevronIcon dir="right" />
                </button>
              </>
            )}
            <Link to="/diary" className="section-link">
              See diary
            </Link>
          </div>
        </div>

        {entries === null ? (
          <p className="hint">Loading…</p>
        ) : entries.length === 0 ? (
          <div className="empty">
            <p className="serif-title">Nothing logged yet</p>
            <p className="muted">Log a book you've read and it will show up here.</p>
            <button className="btn btn--secondary" onClick={() => openLog()}>
              Log your first book
            </button>
          </div>
        ) : (
          // Up to 10 most recent entries; 4 visible at a time, the rest scroll horizontally.
          <div className="recent" ref={row}>
            {entries.map((e) => (
              <article key={e.id} className="recent__item">
                <button
                  className="recent__cover"
                  onClick={() => openLog({ entry: e })}
                  aria-label={`Edit log for ${e.book.title}`}
                >
                  <Cover book={e.book} size="lg" />
                </button>
                <div className="recent__meta">
                  <Link to={`/book/${e.book.id}`} className="recent__title">
                    {e.book.title}
                  </Link>
                  <span className="recent__line">
                    {e.rating ? (
                      <Stars value={e.rating} size={13} compact />
                    ) : (
                      <span className="muted small">No rating</span>
                    )}
                    {e.liked && <HeartIcon size={13} className="heart" />}
                    {e.isReread && <RepeatIcon size={13} className="muted" />}
                    {e.review && <ReviewIcon size={13} className="muted" />}
                  </span>
                  <span className="muted small">{formatDate(e.readOn ?? e.createdAt.slice(0, 10))}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {entries && entries.length > 0 && <p className="muted small">Tip: click a cover to edit that entry.</p>}

      <ActivityFeed />
    </div>
  );
}

export function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
