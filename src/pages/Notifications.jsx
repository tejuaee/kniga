import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Avatar } from '../components/Avatar';
import { timeAgo } from '../time';

/** Tells the bell in the nav bar that everything has been read. */
export const NOTIFICATIONS_READ = 'kniga:notifications-read';

/** `/notifications`: follows, likes and comments. Opening the page marks them all read. */
export function Notifications() {
  const [list, setList] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api('/notifications')
      .then(async (r) => {
        setList(r.notifications); // keep showing what was unread on this visit
        if (r.unread > 0) {
          await api('/notifications/read', 'POST');
          window.dispatchEvent(new Event(NOTIFICATIONS_READ));
        }
      })
      .catch(() => setError(true));
  }, []);

  return (
    <div className="page">
      <section>
        <p className="eyebrow">Activity</p>
        <h1 className="serif-title serif-title--xl">Notifications</h1>
      </section>

      {error ? (
        <p className="hint">Couldn't load notifications. Refresh to try again.</p>
      ) : list === null ? (
        <p className="hint">Loading…</p>
      ) : list.length === 0 ? (
        <div className="empty card-section">
          <p className="serif-title">Nothing yet</p>
          <p className="muted">When someone follows you, or likes or comments on your reviews, you'll see it here.</p>
        </div>
      ) : (
        <section className="card-section">
          <ul className="notifications">
            {list.map((n) => (
              <li key={n.id} className={`notification${n.read ? '' : ' notification--unread'}`}>
                <Link to={`/u/${n.actor.username}`} aria-label={n.actor.username}>
                  <Avatar user={n.actor} size={40} />
                </Link>
                <div className="notification__body">
                  <p className="notification__text">
                    <Link to={`/u/${n.actor.username}`} className="plain-link">
                      <strong>{n.actor.username}</strong>
                    </Link>{' '}
                    {n.type === 'follow' && 'started following you'}
                    {n.type === 'like' && (
                      <>
                        liked your review of <Link to={`/entry/${n.entry.id}`}>{n.entry.bookTitle}</Link>
                      </>
                    )}
                    {n.type === 'comment' && (
                      <>
                        commented on your review of{' '}
                        <Link to={`/entry/${n.entry.id}#comments`}>{n.entry.bookTitle}</Link>
                      </>
                    )}
                  </p>
                  {n.comment && <p className="notification__quote">“{n.comment}”</p>}
                  <span className="muted small">{timeAgo(n.createdAt)}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
