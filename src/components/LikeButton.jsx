import { useState } from 'react';
import { api } from '../api';
import { HeartIcon, HeartOutlineIcon, ThumbDownIcon } from './Icons';

/**
 * ♥ like and 👎 dislike for a review, with counts. A reader can pick one or neither;
 * picking one switches off the other (the server does the same).
 * `onChange(social)` gets { likes, dislikes, comments, likedByMe, dislikedByMe } back from the server.
 */
export function LikeButton({ entryId, social, onChange }) {
  const [busy, setBusy] = useState(false);

  const send = async (kind, on) => {
    setBusy(true);
    try {
      onChange(await api(`/entries/${entryId}/${kind}`, on ? 'DELETE' : 'PUT'));
    } catch {
      // leave it as it was; the counts stay honest
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="reactions">
      <button
        type="button"
        className={`social-btn${social.likedByMe ? ' social-btn--on' : ''}`}
        onClick={() => send('like', social.likedByMe)}
        disabled={busy}
        aria-pressed={social.likedByMe}
        aria-label={social.likedByMe ? 'Remove like' : 'Like this review'}
      >
        {social.likedByMe ? <HeartIcon size={16} /> : <HeartOutlineIcon size={16} />}
        <span>{social.likes}</span>
      </button>
      <button
        type="button"
        className={`social-btn${social.dislikedByMe ? ' social-btn--down' : ''}`}
        onClick={() => send('dislike', social.dislikedByMe)}
        disabled={busy}
        aria-pressed={social.dislikedByMe}
        aria-label={social.dislikedByMe ? 'Remove dislike' : 'Dislike this review'}
      >
        <ThumbDownIcon size={16} filled={social.dislikedByMe} />
        <span>{social.dislikes}</span>
      </button>
    </span>
  );
}
