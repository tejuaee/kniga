import { useState } from 'react';
import { api, ApiError } from '../api';

/**
 * Follow / Following toggle for another reader.
 * `onChange({ following, followers })` gets the new state from the server.
 */
export function FollowButton({ username, following, onChange, size = 'sm' }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api(`/users/${encodeURIComponent(username)}/follow`, following ? 'DELETE' : 'PUT');
      onChange?.(r);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="follow">
      <button
        type="button"
        className={`btn btn--${size} ${following ? 'btn--secondary follow__btn--on' : 'btn--primary'}`}
        onClick={toggle}
        disabled={busy}
        aria-pressed={following}
        aria-label={following ? `Unfollow ${username}` : `Follow ${username}`}
      >
        {following ? (
          <>
            <span className="follow__label">Following</span>
            <span className="follow__hover">Unfollow</span>
          </>
        ) : (
          'Follow'
        )}
      </button>
      {error && <span className="field-error">{error}</span>}
    </span>
  );
}
