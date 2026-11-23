import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { Cover } from '../components/Cover';
import { Stars } from '../components/Stars';
import { Avatar } from '../components/Avatar';
import { LikeButton } from '../components/LikeButton';
import { HeartIcon, RepeatIcon, XIcon } from '../components/Icons';
import { timeAgo } from '../time';
import { formatDate } from './Home';

const COMMENT_MAX = 1000;

/** `/entry/:id`: one reader's log / review, with likes and comments. */
export function EntryPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setData(null);
    setError(null);
    api(`/entries/${id}`)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load this review.'));
  }, [id]);

  // Jump to the comments when arriving from a "comment" link
  useEffect(() => {
    if (data && window.location.hash === '#comments') document.getElementById('comments')?.scrollIntoView();
  }, [data]);

  if (error) {
    return (
      <div className="page">
        <div className="empty card-section">
          <p className="serif-title">{error}</p>
          <Link to="/" className="section-link">
            Back home
          </Link>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="page">
        <p className="hint">Loading…</p>
      </div>
    );
  }

  const { entry: e, comments } = data;
  const setSocial = (social) => setData({ ...data, entry: { ...e, social } });
  const date = e.readOn ?? e.createdAt.slice(0, 10);

  return (
    <div className="page entry-page">
      <section className="entry-page__main card-section">
        <Link to={`/book/${e.book.id}`} className="entry-page__cover" aria-label={e.book.title}>
          <Cover book={e.book} size="md" />
        </Link>
        <div className="entry-page__body">
          <Link to={`/u/${e.user.username}`} className="feed-card__who">
            <Avatar user={e.user} size={28} />
            <span>
              {e.isReread ? 'Re-read' : 'Read'} by <strong>{e.user.username}</strong>
            </span>
          </Link>
          <h1 className="serif-title serif-title--xl">
            <Link to={`/book/${e.book.id}`} className="plain-link">
              {e.book.title}
            </Link>
            {e.book.year && <span className="title-year"> {e.book.year}</span>}
          </h1>
          <div className="review__line">
            {e.rating && <Stars value={e.rating} size={16} compact />}
            {e.liked && <HeartIcon size={15} className="heart" />}
            {e.isReread && <RepeatIcon size={15} className="muted" />}
            <span className="muted small">{formatDate(date)}</span>
          </div>
          {e.review ? (
            e.hasSpoiler ? (
              <details className="spoiler">
                <summary>This review contains spoilers — show anyway</summary>
                <p className="review__text">{e.review}</p>
              </details>
            ) : (
              <p className="review__text">{e.review}</p>
            )
          ) : (
            <p className="muted">No review, just a log.</p>
          )}
          {e.tags.length > 0 && (
            <div className="tag-row">
              {e.tags.map((t) => (
                <span key={t} className="tag tag--sm">
                  {t}
                </span>
              ))}
            </div>
          )}
          <div className="feed-card__foot">
            <LikeButton entryId={e.id} social={e.social} onChange={setSocial} />
            <span className="muted small">
              {e.social.likes === 1 ? '1 like' : `${e.social.likes} likes`} ·{' '}
              {e.social.dislikes === 1 ? '1 dislike' : `${e.social.dislikes} dislikes`}
            </span>
          </div>
        </div>
      </section>

      <Comments
        entryId={e.id}
        comments={comments}
        onChange={(next) =>
          setData({ ...data, comments: next, entry: { ...e, social: { ...e.social, comments: next.length } } })
        }
      />
    </div>
  );
}

function Comments({ entryId, comments, onChange }) {
  const [body, setBody] = useState('');
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);

  const submit = async (ev) => {
    ev.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const r = await api(`/entries/${entryId}/comments`, 'POST', { body });
      onChange([...comments, r.comment]);
      setBody('');
    } catch (e) {
      setErr(e instanceof ApiError ? (e.fields.body ?? e.message) : 'Could not post. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c) => {
    if (!window.confirm('Delete this comment?')) return;
    try {
      await api(`/comments/${c.id}`, 'DELETE');
      onChange(comments.filter((x) => x.id !== c.id));
    } catch {
      window.alert('Could not delete the comment. Try again.');
    }
  };

  return (
    <section className="card-section" id="comments">
      <div className="section-head">
        <h2 className="section-title">
          {comments.length === 1 ? '1 comment' : `${comments.length} comments`}
        </h2>
      </div>

      {comments.length > 0 && (
        <ul className="comments">
          {comments.map((c) => (
            <li key={c.id} className="comment">
              <Link to={`/u/${c.user.username}`} aria-label={c.user.username}>
                <Avatar user={c.user} size={32} />
              </Link>
              <div className="comment__body">
                <div className="comment__head">
                  <Link to={`/u/${c.user.username}`} className="plain-link">
                    <strong>{c.user.username}</strong>
                  </Link>
                  <span className="muted small">{timeAgo(c.createdAt)}</span>
                  {c.canDelete && (
                    <button className="icon-btn comment__delete" onClick={() => remove(c)} aria-label="Delete comment">
                      <XIcon size={14} />
                    </button>
                  )}
                </div>
                <p className="comment__text">{c.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form className="comment-form" onSubmit={submit}>
        <label htmlFor="comment" className="mini-label">
          Add a comment
        </label>
        <textarea
          id="comment"
          className="input textarea textarea--short"
          value={body}
          maxLength={COMMENT_MAX}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Say something about this review"
          aria-invalid={Boolean(err)}
        />
        <div className="bio-form__row">
          <span className="muted small">
            {body.length}/{COMMENT_MAX}
          </span>
          {err && <p className="field-error">{err}</p>}
          <button className="btn btn--primary btn--sm" disabled={saving || !body.trim()}>
            {saving ? 'Posting…' : 'Post'}
          </button>
        </div>
      </form>
    </section>
  );
}
