import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Cover } from './Cover';
import { Stars } from './Stars';
import { Avatar } from './Avatar';
import { LikeButton } from './LikeButton';
import { CommentIcon, HeartIcon, RepeatIcon } from './Icons';
import { timeAgo } from '../time';

/** One log in the activity feed: who read what, their rating and review, likes and comments. */
export function EntryCard({ item }) {
  const [social, setSocial] = useState(item.social);
  const e = item;
  return (
    <article className="feed-card">
      <header className="feed-card__head">
        <Link to={`/u/${e.user.username}`} className="feed-card__who">
          <Avatar user={e.user} size={32} />
          <strong>{e.user.username}</strong>
        </Link>
        <span className="muted small">
          {e.isReread ? 're-read' : e.review ? 'reviewed' : 'read'} · {timeAgo(e.createdAt)}
        </span>
      </header>

      <div className="feed-card__body">
        <Link to={`/book/${e.book.id}`} className="feed-card__cover" tabIndex={-1} aria-hidden="true">
          <Cover book={e.book} size="sm" />
        </Link>
        <div className="feed-card__text">
          <h3 className="review__title">
            <Link to={`/entry/${e.id}`}>{e.book.title}</Link>
            {e.book.year && <span className="title-year"> {e.book.year}</span>}
          </h3>
          <div className="review__line">
            {e.rating && <Stars value={e.rating} size={13} compact />}
            {e.liked && <HeartIcon size={13} className="heart" />}
            {e.isReread && <RepeatIcon size={13} className="muted" />}
          </div>
          {e.review &&
            (e.hasSpoiler ? (
              <details className="spoiler">
                <summary>This review contains spoilers — show anyway</summary>
                <p className="review__text feed-card__review">{e.review}</p>
              </details>
            ) : (
              <p className="review__text feed-card__review">{e.review}</p>
            ))}
        </div>
      </div>

      <footer className="feed-card__foot">
        <LikeButton entryId={e.id} social={social} onChange={setSocial} />
        <Link to={`/entry/${e.id}#comments`} className="social-btn" aria-label={`${social.comments} comments`}>
          <CommentIcon size={16} />
          <span>{social.comments}</span>
        </Link>
      </footer>
    </article>
  );
}
