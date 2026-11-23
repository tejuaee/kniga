import { useEffect, useRef, useState } from 'react';
import { api, ApiError, localToday } from '../api';
import { Cover } from './Cover';
import { StarInput } from './Stars';
import { TagInput } from './TagInput';
import { HeartIcon, SearchIcon } from './Icons';
import { Modal } from './Modal';

/**
 * The Letterboxd-style "I read…" dialog (UC-05, 06, 07, 09).
 * Step 1 (only from the global "+ Log" button): find the book. Step 2: the log form.
 */
export function LogModal({ initialBook, entry, onClose, onSaved }) {
  const [book, setBook] = useState(initialBook);

  return (
    <Modal onClose={onClose} labelledBy="log-title">
      {book ? (
        <LogForm
          book={book}
          entry={entry}
          onBack={entry || initialBook ? undefined : () => setBook(undefined)}
          onSaved={onSaved}
        />
      ) : (
        <BookSearch onPick={setBook} />
      )}
    </Modal>
  );
}

// ---------- step 1: search (UC-02)
export function BookSearch({
  onPick,
  eyebrow = 'Add to your books',
  title = 'What did you read?',
  suggestions = [],
  badge,
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [state, setState] = useState('idle');
  const [note, setNote] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => inputRef.current?.focus(), []);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setResults([]);
      setState('idle');
      return;
    }
    setState('loading');
    const ctrl = { cancelled: false };
    const t = setTimeout(async () => {
      try {
        const r = await api(`/books/search?q=${encodeURIComponent(query)}`);
        if (ctrl.cancelled) return;
        setResults(r.results);
        setNote(
          r.warning ??
            (r.source === 'openlibrary' && r.results.length ? 'Not in Kniga yet — found on Open Library.' : null),
        );
      } catch {
        if (!ctrl.cancelled) setNote('Search failed. Check your connection and try again.');
      } finally {
        if (!ctrl.cancelled) setState('done');
      }
    }, 250);
    return () => {
      ctrl.cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  return (
    <div className="log-search">
      <p className="eyebrow">{eyebrow}</p>
      <h2 id="log-title" className="serif-title">
        {title}
      </h2>
      <label className="search-field">
        <SearchIcon />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by title, author or ISBN"
          aria-label="Search books"
        />
      </label>
      {note && <p className="hint">{note}</p>}
      {q.trim().length < 2 && suggestions.length > 0 && <p className="mini-label">From your diary</p>}
      <ul className="search-results">
        {(q.trim().length < 2 ? suggestions : results).map((b) => (
          <li key={b.id}>
            <button type="button" className="search-result" onClick={() => onPick(b)}>
              <Cover book={b} size="xs" />
              <span>
                <strong>{b.title}</strong>
                {b.year && <span className="muted"> {b.year}</span>}
                <span className="muted block">{b.author}</span>
                {badge?.(b) && <span className="search-result__badge">{badge(b)}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {state === 'done' && results.length === 0 && !note && <p className="hint">No results found.</p>}
      {state === 'loading' && <p className="hint">Searching…</p>}
    </div>
  );
}

// ---------- step 2: the form
function LogForm({ book, entry, onBack, onSaved }) {
  const today = localToday();
  const [hasDate, setHasDate] = useState(entry ? entry.readOn !== null : true);
  const [readOn, setReadOn] = useState(entry?.readOn ?? today);
  const [isReread, setIsReread] = useState(entry?.isReread ?? false);
  const [review, setReview] = useState(entry?.review ?? '');
  const [hasSpoiler, setHasSpoiler] = useState(entry?.hasSpoiler ?? false);
  const [tags, setTags] = useState(entry?.tags ?? []);
  const [rating, setRating] = useState(entry?.rating ?? null);
  const [liked, setLiked] = useState(entry?.liked ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // New log for a book you've already logged → preset "read before" (UC-05 3b) and carry over ♥.
  useEffect(() => {
    if (entry) return;
    api(`/books/${book.id}`)
      .then((p) => {
        if (p.me?.entries.length) setIsReread(true);
        if (p.me?.liked) setLiked(true);
      })
      .catch(() => {});
  }, [book.id, entry]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      bookId: book.id,
      readOn: hasDate ? readOn : null,
      rating,
      review,
      hasSpoiler,
      isReread,
      liked,
      tags,
    };
    try {
      if (entry) await api(`/logs/${entry.id}`, 'PATCH', body);
      else await api('/logs', 'POST', body);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, 'Could not save. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!entry) return;
    setBusy(true);
    try {
      await api(`/logs/${entry.id}`, 'DELETE');
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, 'Could not delete. Try again.'));
      setBusy(false);
    }
  };

  return (
    <form className="log-form" onSubmit={submit}>
      <div className="log-form__cover">
        <Cover book={book} size="md" />
        {onBack && (
          <button type="button" className="link-btn" onClick={onBack}>
            Change book
          </button>
        )}
      </div>

      <div className="log-form__body">
        <p className="eyebrow">{entry ? 'Edit diary entry' : 'I read…'}</p>
        <h2 id="log-title" className="serif-title">
          {book.title} {book.year && <span className="title-year">{book.year}</span>}
        </h2>
        {book.author && <p className="muted">by {book.author}</p>}

        <div className="log-form__row">
          <label className="check">
            <input type="checkbox" checked={hasDate} onChange={(e) => setHasDate(e.target.checked)} />
            <span>Read on</span>
          </label>
          <input
            type="date"
            className="input input--date"
            value={readOn}
            max={today}
            disabled={!hasDate}
            onChange={(e) => setReadOn(e.target.value)}
            aria-label="Date read"
            aria-invalid={Boolean(error?.fields.readOn)}
          />
          <label className="check">
            <input type="checkbox" checked={isReread} onChange={(e) => setIsReread(e.target.checked)} />
            <span>I've read this before</span>
          </label>
        </div>
        {error?.fields.readOn && <p className="field-error">{error.fields.readOn}</p>}

        <textarea
          className="input textarea"
          placeholder="Add a review…"
          value={review}
          onChange={(e) => setReview(e.target.value)}
          rows={5}
          aria-label="Review"
        />
        {review.trim() && (
          <label className="check">
            <input type="checkbox" checked={hasSpoiler} onChange={(e) => setHasSpoiler(e.target.checked)} />
            <span>Contains spoilers</span>
          </label>
        )}
        {error?.fields.review && <p className="field-error">{error.fields.review}</p>}

        <TagInput value={tags} onChange={setTags} />
        {error?.fields.tags && <p className="field-error">{error.fields.tags}</p>}

        <div className="log-form__footer">
          <div className="rate-like">
            <div>
              <span className="mini-label">Rating{rating ? ` · ${rating}` : ''}</span>
              <StarInput value={rating} onChange={setRating} />
            </div>
            <div>
              <span className="mini-label">Like</span>
              <button
                type="button"
                className={`like-btn ${liked ? 'is-on' : ''}`}
                aria-pressed={liked}
                aria-label={liked ? 'Unlike' : 'Like'}
                onClick={() => setLiked(!liked)}
              >
                <HeartIcon size={30} />
              </button>
            </div>
          </div>
          <div className="log-form__actions">
            {entry &&
              (confirmDelete ? (
                <span className="confirm">
                  Delete this entry?
                  <button type="button" className="btn btn--danger btn--sm" onClick={remove} disabled={busy}>
                    Delete
                  </button>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </button>
                </span>
              ) : (
                <button type="button" className="btn btn--ghost" onClick={() => setConfirmDelete(true)}>
                  Delete
                </button>
              ))}
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
        {error && !Object.keys(error.fields).length && (
          <p className="form-error" role="alert">
            {error.message}
          </p>
        )}
        {error?.fields.rating && <p className="field-error">{error.fields.rating}</p>}
      </div>
    </form>
  );
}
