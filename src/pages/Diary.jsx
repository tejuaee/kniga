import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useLog } from '../log-context';
import { Cover } from '../components/Cover';
import { Stars } from '../components/Stars';
import { HeartIcon, PencilIcon, RepeatIcon, ReviewIcon } from '../components/Icons';

/** Letterboxd-style diary: grouped by month, one row per log entry. */
export function Diary() {
  const { openLog, version } = useLog();
  const [year, setYear] = useState('all');
  const [entries, setEntries] = useState(null);
  const [years, setYears] = useState([]);

  useEffect(() => {
    api(`/logs${year === 'all' ? '' : `?year=${year}`}`)
      .then((r) => {
        setEntries(r.entries);
        setYears(r.years);
      })
      .catch(() => setEntries([]));
  }, [year, version]);

  const months = useMemo(() => {
    const groups = [];
    for (const e of entries ?? []) {
      const date = e.readOn ?? e.createdAt.slice(0, 10);
      const key = date.slice(0, 7);
      let g = groups.find((x) => x.key === key);
      if (!g) {
        const [y, m] = key.split('-').map(Number);
        g = {
          key,
          label: new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }),
          items: [],
        };
        groups.push(g);
      }
      g.items.push(e);
    }
    return groups;
  }, [entries]);

  return (
    <div className="page">
      <div className="section-head">
        <div>
          <p className="eyebrow">Your reading</p>
          <h1 className="serif-title serif-title--xl">Diary</h1>
        </div>
        <label className="select-label">
          <span className="mini-label">Year</span>
          <select
            className="input input--select"
            value={year}
            onChange={(e) => setYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          >
            <option value="all">All years</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </div>

      {entries === null ? (
        <p className="hint">Loading…</p>
      ) : entries.length === 0 ? (
        <div className="empty card-section">
          <p className="serif-title">Your diary is empty</p>
          <p className="muted">Every book you log with a date shows up here, newest first.</p>
          <button className="btn btn--secondary" onClick={() => openLog()}>
            Log a book
          </button>
        </div>
      ) : (
        <div className="card-section diary">
          <table className="diary__table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Day</th>
                <th>Book</th>
                <th>Rating</th>
                <th aria-label="Liked">Like</th>
                <th aria-label="Re-read">Re-read</th>
                <th aria-label="Review">Review</th>
                <th aria-label="Edit" />
              </tr>
            </thead>
            <tbody>
              {months.map((g) =>
                g.items.map((e, i) => {
                  const date = e.readOn ?? e.createdAt.slice(0, 10);
                  return (
                    <tr key={e.id}>
                      <td className="diary__month">{i === 0 && <span className="month-chip">{g.label}</span>}</td>
                      <td className="diary__day">
                        {e.readOn ? (
                          Number(date.slice(8, 10))
                        ) : (
                          <span className="muted" title="No date">
                            —
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="diary__book">
                          <Cover book={e.book} size="xs" />
                          <div>
                            <Link to={`/book/${e.book.id}`} className="diary__title">
                              {e.book.title}
                            </Link>
                            {e.book.year && <span className="muted"> {e.book.year}</span>}
                            <div className="muted small">{e.book.author}</div>
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
                        </div>
                      </td>
                      <td>
                        {e.rating ? <Stars value={e.rating} size={14} compact /> : <span className="muted">—</span>}
                      </td>
                      <td>{e.liked && <HeartIcon size={16} className="heart" />}</td>
                      <td>{e.isReread && <RepeatIcon size={16} className="muted" />}</td>
                      <td>
                        {e.review && (
                          <span title={e.hasSpoiler ? 'Review contains spoilers' : 'Has a review'}>
                            <ReviewIcon size={16} className={e.hasSpoiler ? 'heart' : 'muted'} />
                          </span>
                        )}
                      </td>
                      <td>
                        <button
                          className="icon-btn"
                          onClick={() => openLog({ entry: e })}
                          aria-label={`Edit entry for ${e.book.title}`}
                        >
                          <PencilIcon />
                        </button>
                      </td>
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
