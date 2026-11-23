import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { FollowButton } from './FollowButton';

/**
 * Readers as rows: avatar, name, books read, bio and a Follow button (not on yourself).
 * `onFollowChange(username, following)` lets the parent update its list.
 */
export function ReaderList({ readers, onFollowChange }) {
  const { user } = useAuth();
  return (
    <ul className="search-members">
      {readers.map((m) => (
        <li key={m.username} className="reader-row">
          <Link to={`/u/${m.username}`} className="search-member">
            <span className="search-member__avatar" aria-hidden="true">
              {m.avatarUrl ? <img src={m.avatarUrl} alt="" /> : m.username[0].toUpperCase()}
            </span>
            <span className="search-member__who">
              <strong>{m.username}</strong>
              {m.role !== 'reader' && <span className="search-result__badge">{m.role}</span>}
              <span className="muted small block">
                {m.books} {m.books === 1 ? 'book' : 'books'} read
              </span>
              {m.bio && <span className="search-member__bio">{m.bio}</span>}
            </span>
          </Link>
          {user && user.username.toLowerCase() !== m.username.toLowerCase() && (
            <FollowButton
              username={m.username}
              following={m.isFollowing}
              onChange={(r) => onFollowChange?.(m.username, r.following)}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

/** Copy of `readers` with one reader's follow state changed. */
export const setFollowing = (readers, username, following) =>
  readers.map((m) => (m.username === username ? { ...m, isFollowing: following } : m));
