import { useEffect, useState } from 'react';
import { Link, NavLink, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { ReaderList, setFollowing } from '../components/ReaderList';

/** `/u/:username/followers` and `/u/:username/following`. */
export function Follows({ kind }) {
  const { username = '' } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setData(null);
    setError(null);
    api(`/users/${encodeURIComponent(username)}/${kind}`)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load this list.'));
  }, [username, kind]);

  const name = data?.username ?? username;

  return (
    <div className="page">
      <section>
        <p className="eyebrow">
          <Link to={`/u/${name}`}>{name}</Link>
        </p>
        <h1 className="serif-title serif-title--xl">{kind === 'followers' ? 'Followers' : 'Following'}</h1>
      </section>

      <nav className="search-tabs" aria-label="Followers and following">
        <NavLink to={`/u/${name}/followers`} className="search-tabs__tab">
          Followers
        </NavLink>
        <NavLink to={`/u/${name}/following`} className="search-tabs__tab">
          Following
        </NavLink>
      </nav>

      {error ? (
        <p className="hint">{error}</p>
      ) : !data ? (
        <p className="hint">Loading…</p>
      ) : data.results.length === 0 ? (
        <div className="empty">
          <p className="serif-title">{kind === 'followers' ? 'No followers yet' : 'Not following anyone yet'}</p>
          <p className="muted">
            {kind === 'followers'
              ? 'When readers follow this profile, they show up here.'
              : 'Find readers in Search and follow them to see them here.'}
          </p>
          {kind === 'following' && (
            <Link to="/search?type=readers" className="btn btn--secondary">
              Find readers
            </Link>
          )}
        </div>
      ) : (
        <section className="card-section">
          <ReaderList
            readers={data.results}
            onFollowChange={(u, f) => setData({ ...data, results: setFollowing(data.results, u, f) })}
          />
        </section>
      )}
    </div>
  );
}
