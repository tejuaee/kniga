import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useLog } from '../log-context';
import { Cover } from '../components/Cover';
import { Stars } from '../components/Stars';
import { ClockIcon, EyeIcon, HeartIcon, PencilIcon, RepeatIcon } from '../components/Icons';
import { formatDate } from './Home';

export function BookPage() {
  const { id } = useParams();
  const { openLog, version } = useLog();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = () =>
    api(`/books/${id}`)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load this book.'));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, version]);

  const toggle = async (patch) => {
    setNotice(null);
    try {
      await api(`/books/${id}/status`, 'PUT', patch);
      await load();
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : 'Could not update.');
    }
  };

  if (error)
    return (
      <div className="page">
        <p className="form-error">{error}</p>
      </div>
    );
  if (!data)
    return (
      <div className="page">
        <p className="hint">Loading…</p>
      </div>
    );
  const { book, stats, me } = data;

  return (
    <div className="page book">
      <div className="book__grid">
        <div className="book__cover">
          <Cover book={book} size="lg" />
        </div>

        <div className="book__info">
          <h1 className="serif-title serif-title--xxl">{book.title}</h1>
          <p className="book__byline">
            {book.year && <span>{book.year}</span>}{' '}
            {book.author && (
              <>
                by <strong>{book.author}</strong>
              </>
            )}
          </p>
          {book.description && <p className="lead">{book.description}</p>}
          <dl className="book__facts">
            {book.pageCount && (
              <>
                <dt>Pages</dt>
                <dd>{book.pageCount}</dd>
              </>
            )}
            {book.isbn && (
              <>
                <dt>ISBN</dt>
                <dd>{book.isbn}</dd>
              </>
            )}
            <dt>Readers</dt>
            <dd>{stats.readers}</dd>
            <dt>Average</dt>
            <dd>
              {stats.ratings >= 1 && stats.average
                ? `${stats.average.toFixed(2)} from ${stats.ratings} rating${stats.ratings === 1 ? '' : 's'}`
                : 'Not enough ratings yet'}
            </dd>
          </dl>

          <section className="card-section">
            <div className="section-head">
              <h2 className="section-title">Your diary for this book</h2>
            </div>
            {me && me.entries.length ? (
              <ul className="entry-list">
                {me.entries.map((e) => (
                  <li key={e.id} className="entry-list__item">
                    <div>
                      <div className="entry-list__line">
                        <strong>{e.readOn ? formatDate(e.readOn) : 'No date'}</strong>
                        {e.rating && <Stars value={e.rating} size={14} compact />}
                        {e.liked && <HeartIcon size={14} className="heart" />}
                        {e.isReread && (
                          <span className="muted small">
                            <RepeatIcon size={13} /> re-read
                          </span>
                        )}
                      </div>
                      {e.review &&
                        (e.hasSpoiler ? (
                          <details className="spoiler">
                            <summary>This review contains spoilers — show anyway</summary>
                            <p>{e.review}</p>
                          </details>
                        ) : (
                          <p className="entry-list__review">{e.review}</p>
                        ))}
                      {e.tags.length > 0 && (
                        <div className="tag-row">
                          {e.tags.map((t) => (
                            <span key={t} className="tag tag--sm">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <button className="icon-btn" onClick={() => openLog({ entry: e })} aria-label="Edit entry">
                      <PencilIcon />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">You haven't logged this book yet.</p>
            )}
          </section>
        </div>

        {me && (
          <aside className="action-panel" aria-label="Your actions">
            <div className="action-panel__toggles">
              <button
                className={`toggle ${me.read ? 'is-read' : ''}`}
                aria-pressed={me.read}
                onClick={() => toggle({ read: !me.read })}
              >
                <EyeIcon size={28} />
                <span>{me.read ? 'Read' : 'Read?'}</span>
              </button>
              <button
                className={`toggle ${me.liked ? 'is-liked' : ''}`}
                aria-pressed={me.liked}
                onClick={() => toggle({ liked: !me.liked })}
              >
                <HeartIcon size={28} />
                <span>{me.liked ? 'Liked' : 'Like'}</span>
              </button>
              <button
                className={`toggle ${me.wantToRead ? 'is-want' : ''}`}
                aria-pressed={me.wantToRead}
                onClick={() => toggle({ wantToRead: !me.wantToRead })}
              >
                <ClockIcon size={28} />
                <span>Want to read</span>
              </button>
            </div>
            <div className="action-panel__rating">
              <span className="mini-label">{me.rating ? 'Your rating' : 'Not rated'}</span>
              <Stars value={me.rating ?? 0} size={26} />
            </div>
            <button className="action-panel__row" onClick={() => openLog({ book })}>
              {me.entries.length ? 'Log again…' : 'Log or review…'}
            </button>
            {notice && <p className="field-error action-panel__notice">{notice}</p>}
          </aside>
        )}
      </div>
    </div>
  );
}
