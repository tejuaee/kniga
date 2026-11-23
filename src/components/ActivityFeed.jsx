import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { EntryCard } from './EntryCard';

/** Home page: newest logs from readers you follow, 20 at a time. */
export function ActivityFeed() {
  const [items, setItems] = useState(null);
  const [nextBefore, setNextBefore] = useState(null);
  const [following, setFollowing] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    api('/feed')
      .then((r) => {
        setItems(r.items);
        setNextBefore(r.nextBefore);
        setFollowing(r.following);
      })
      .catch(() => setError(true));
  }, []);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const r = await api(`/feed?before=${nextBefore}`);
      setItems([...items, ...r.items]);
      setNextBefore(r.nextBefore);
    } catch {
      setError(true);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <section className="card-section">
      <div className="section-head">
        <h2 className="section-title">From readers you follow</h2>
        <div className="section-head__right">
          <Link to="/search?type=readers" className="section-link">
            Find readers
          </Link>
        </div>
      </div>

      {error && !items ? (
        <p className="hint">Couldn't load activity. Refresh to try again.</p>
      ) : items === null ? (
        <p className="hint">Loading…</p>
      ) : items.length === 0 ? (
        <div className="empty">
          <p className="serif-title">{following ? 'Nothing new yet' : 'Follow readers to see what they read'}</p>
          <p className="muted">
            {following
              ? "The readers you follow haven't logged anything yet."
              : 'Their logs, ratings and reviews will show up here.'}
          </p>
          {!following && (
            <Link to="/search?type=readers" className="btn btn--secondary">
              Find readers
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="feed">
            {items.map((item) => (
              <EntryCard key={item.id} item={item} />
            ))}
          </div>
          {nextBefore && (
            <div className="feed__more">
              <button className="btn btn--secondary" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : 'Show older'}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
