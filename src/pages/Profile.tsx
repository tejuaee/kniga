import { useEffect, useState, type DragEvent, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { api, ApiError, type Book, type Entry, type Profile as ProfileData } from '../api';
import { useAuth } from '../auth';
import { useLog } from '../log-context';
import { Cover } from '../components/Cover';
import { Stars } from '../components/Stars';
import { RatingsChart } from '../components/RatingsChart';
import { Modal } from '../components/Modal';
import { BookSearch } from '../components/LogModal';
import { ChevronIcon, HeartIcon, PencilIcon, PlusIcon, RepeatIcon, ReviewIcon, XIcon } from '../components/Icons';
import { formatDate } from './Home';

const BIO_MAX = 300;

/** `/profile` → your own profile. */
export function MyProfile() {
  const { user } = useAuth();
  return <Navigate to={`/u/${user!.username}`} replace />;
}

/** Letterboxd-style profile: header + stats, Top 4, recent activity, reviews; ratings spread and tags on the side. */
export function Profile() {
  const { username = '' } = useParams();
  const { version, openLog } = useLog();
  const [data, setData] = useState<ProfileData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    api<ProfileData>(`/users/${encodeURIComponent(username)}`)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load this profile.'));
  }, [username, version]);

  if (error) {
    return (
      <div className="page">
        <div className="empty card-section">
          <p className="serif-title">{error}</p>
          <Link to="/" className="section-link">Back home</Link>
        </div>
      </div>
    );
  }
  if (!data || data.user.username.toLowerCase() !== username.toLowerCase()) {
    return <div className="page"><p className="hint">Loading…</p></div>;
  }

  const { user, isMe, stats } = data;

  return (
    <div className="page profile">
      <ProfileHeader data={data} onBio={(bio) => setData({ ...data, user: { ...user, bio } })} />

      <div className="profile__grid">
        <div className="profile__main">
          <TopFour
            key={user.id}
            initial={data.favorites}
            isMe={isMe}
            suggestions={data.recent.map((e) => e.book)}
          />

          <section>
            <div className="profile-head">
              <h2 className="section-title">Recent activity</h2>
              {isMe && <Link to="/diary" className="section-link">Diary</Link>}
            </div>
            {data.recent.length ? (
              <div className="poster-row">
                {data.recent.map((e) => <ActivityPoster key={e.id} entry={e} />)}
              </div>
            ) : (
              <Empty isMe={isMe} me="Books you log show up here." other={`${user.username} hasn't logged anything yet.`}>
                {isMe && <button className="btn btn--secondary btn--sm" onClick={() => openLog()}>Log a book</button>}
              </Empty>
            )}
          </section>

          <section>
            <div className="profile-head">
              <h2 className="section-title">Recent reviews</h2>
              <span className="muted small">{stats.reviews} {stats.reviews === 1 ? 'review' : 'reviews'}</span>
            </div>
            {data.reviews.length ? (
              <ul className="review-list">
                {data.reviews.map((e) => <ReviewItem key={e.id} entry={e} by={user.username} />)}
              </ul>
            ) : (
              <Empty isMe={isMe} me="Write a review when you log a book and it lands here." other="No reviews yet." />
            )}
          </section>
        </div>

        <aside className="profile__side">
          <section>
            <div className="profile-head">
              <h2 className="section-title">Ratings</h2>
            </div>
            <RatingsChart counts={data.ratings} />
          </section>

          <section>
            <div className="profile-head">
              <h2 className="section-title">Tags</h2>
            </div>
            {data.tags.length ? (
              <div className="tag-cloud">
                {data.tags.map((t, i) => (
                  <span key={t.name} className={`tag tag--tone${i % 3}`} title={`Used ${t.count} ${t.count === 1 ? 'time' : 'times'}`}>
                    {t.name} <span className="tag__count">{t.count}</span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="muted small">No tags yet.</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

// ---------- header
function ProfileHeader({ data, onBio }: { data: ProfileData; onBio: (bio: string) => void }) {
  const { user, isMe, stats } = data;
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState(user.bio);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const r = await api<{ bio: string }>('/users/me', 'PATCH', { bio });
      onBio(r.bio);
      setEditing(false);
    } catch (e) {
      setErr(e instanceof ApiError ? e.fields.bio ?? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const joined = new Date(user.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const statItems = [
    { n: stats.books, label: stats.books === 1 ? 'Book' : 'Books' },
    { n: stats.thisYear, label: 'This year' },
    { n: stats.reviews, label: stats.reviews === 1 ? 'Review' : 'Reviews' },
    { n: stats.wantToRead, label: 'Want to read' },
  ];

  return (
    <section className="profile-header">
      <div className="profile-header__avatar" aria-hidden="true">
        {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : user.username[0].toUpperCase()}
      </div>

      <div className="profile-header__who">
        <div className="profile-header__name">
          <h1 className="serif-title serif-title--xl">{user.username}</h1>
          {user.role === 'critic' && <span className="badge">Critic</span>}
          {isMe && !editing && (
            <button className="btn btn--ghost btn--sm" onClick={() => { setBio(user.bio); setEditing(true); }}>
              <PencilIcon size={14} /> Edit profile
            </button>
          )}
        </div>

        {editing ? (
          <form className="bio-form" onSubmit={save}>
            <label htmlFor="bio" className="mini-label">Bio</label>
            <textarea
              id="bio"
              className="input textarea textarea--short"
              value={bio}
              maxLength={BIO_MAX}
              onChange={(e) => setBio(e.target.value)}
              placeholder="A line about what you read"
              aria-invalid={Boolean(err)}
              autoFocus
            />
            <div className="bio-form__row">
              <span className="muted small">{bio.length}/{BIO_MAX}</span>
              {err && <p className="field-error">{err}</p>}
              <span className="bio-form__actions">
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(false)}>Cancel</button>
                <button className="btn btn--primary btn--sm" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
              </span>
            </div>
          </form>
        ) : (
          <p className="profile-header__bio">
            {user.bio || <span className="muted">{isMe ? 'Add a bio so people know what you read.' : 'Reading on Kniga.'}</span>}
          </p>
        )}
        <p className="muted small">Member since {joined}</p>
      </div>

      <dl className="profile-stats">
        {statItems.map((s) => (
          <div key={s.label}>
            <dd>{s.n}</dd>
            <dt>{s.label}</dt>
          </div>
        ))}
      </dl>
    </section>
  );
}

// ---------- Top 4
function TopFour({ initial, isMe, suggestions }: { initial: (Book | null)[]; isMe: boolean; suggestions: Book[] }) {
  const [favs, setFavs] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [slot, setSlot] = useState<number | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [library, setLibrary] = useState<Book[]>(suggestions);

  useEffect(() => setFavs(initial), [initial]);

  // The picker suggests books from your diary before you type.
  useEffect(() => {
    if (slot === null) return;
    api<{ entries: Entry[] }>('/logs?limit=100')
      .then((r) => {
        const seen = new Set<number>();
        setLibrary(r.entries.map((e) => e.book).filter((b) => !seen.has(b.id) && seen.add(b.id)));
      })
      .catch(() => {});
  }, [slot]);

  const save = async (next: (Book | null)[]) => {
    const prev = favs;
    setFavs(next);
    setErr(null);
    try {
      await api('/users/me/favorites', 'PUT', { bookIds: next.map((b) => b?.id ?? null) });
    } catch (e) {
      setFavs(prev);
      setErr(e instanceof ApiError ? e.message : 'Could not save your Top 4.');
    }
  };

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to > 3) return;
    const next = favs.slice();
    [next[from], next[to]] = [next[to], next[from]];
    save(next);
  };

  const pick = (b: Book) => {
    if (slot === null) return;
    const next = favs.slice();
    const already = next.findIndex((f) => f?.id === b.id);
    if (already >= 0) next[already] = next[slot]; // picking a book that's already in the Top 4 swaps them
    next[slot] = b;
    setSlot(null);
    save(next);
  };

  const dragProps = (i: number) =>
    editing
      ? {
          draggable: true,
          onDragStart: (e: DragEvent) => {
            setDragFrom(i);
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(i));
          },
          onDragOver: (e: DragEvent) => e.preventDefault(),
          onDrop: (e: DragEvent) => {
            e.preventDefault();
            if (dragFrom !== null) move(dragFrom, i);
            setDragFrom(null);
          },
          onDragEnd: () => setDragFrom(null),
        }
      : {};

  const empty = favs.every((f) => !f);
  if (!isMe && empty) return null;

  return (
    <section>
      <div className="profile-head">
        <h2 className="section-title">Favorite books</h2>
        {isMe && (
          <button className="btn btn--ghost btn--sm" onClick={() => setEditing(!editing)} aria-pressed={editing}>
            {editing ? 'Done' : 'Edit'}
          </button>
        )}
      </div>
      {editing && <p className="hint top4__hint">Drag a cover to reorder, use the arrows, or choose a different book.</p>}
      {err && <p className="form-error">{err}</p>}

      <ol className={`top4${editing ? ' is-editing' : ''}`}>
        {favs.map((b, i) => (
          <li key={b ? `b${b.id}` : `e${i}`} className={`top4__slot${dragFrom === i ? ' is-dragging' : ''}`} {...dragProps(i)}>
            {b ? (
              <Link to={`/book/${b.id}`} className="top4__cover" draggable={false} onClick={(e) => editing && e.preventDefault()}>
                <Cover book={b} size="lg" />
              </Link>
            ) : isMe ? (
              <button className="top4__empty" onClick={() => setSlot(i)} aria-label={`Choose favorite book ${i + 1}`}>
                <PlusIcon size={22} />
              </button>
            ) : (
              <div className="top4__empty top4__empty--static" />
            )}
            {b && !editing && <span className="top4__title">{b.title}</span>}
            {editing && (
              <div className="top4__controls">
                <button className="icon-btn" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={`Move ${b?.title ?? 'slot'} left`}>
                  <ChevronIcon dir="left" size={16} />
                </button>
                <button className="btn btn--secondary btn--sm top4__change" onClick={() => setSlot(i)}>
                  {b ? 'Change' : 'Add'}
                </button>
                {b && (
                  <button className="icon-btn" onClick={() => { const n = favs.slice(); n[i] = null; save(n); }} aria-label={`Remove ${b.title}`}>
                    <XIcon size={16} />
                  </button>
                )}
                <button className="icon-btn" onClick={() => move(i, i + 1)} disabled={i === 3} aria-label={`Move ${b?.title ?? 'slot'} right`}>
                  <ChevronIcon dir="right" size={16} />
                </button>
              </div>
            )}
          </li>
        ))}
      </ol>
      {isMe && empty && !editing && <p className="hint">Pick four books that say something about you.</p>}

      {slot !== null && (
        <Modal onClose={() => setSlot(null)} labelledBy="log-title">
          <BookSearch
            eyebrow="Favorite books"
            title={`Choose book ${slot + 1} of your Top 4`}
            suggestions={library}
            onPick={pick}
            badge={(book) => {
              const at = favs.findIndex((f) => f?.id === book.id);
              return at >= 0 ? `In Top 4 · #${at + 1}` : null;
            }}
          />
        </Modal>
      )}
    </section>
  );
}

// ---------- activity + reviews
function ActivityPoster({ entry: e }: { entry: Entry }) {
  return (
    <article className="poster">
      <Link to={`/book/${e.book.id}`} className="poster__cover" aria-label={e.book.title}>
        <Cover book={e.book} size="lg" />
      </Link>
      <div className="poster__meta">
        {e.rating ? <Stars value={e.rating} size={12} compact /> : null}
        {e.liked && <HeartIcon size={12} className="heart" />}
        {e.isReread && <RepeatIcon size={12} className="muted" />}
        {e.review && <ReviewIcon size={12} className="muted" />}
      </div>
    </article>
  );
}

function ReviewItem({ entry: e, by }: { entry: Entry; by: string }) {
  const date = e.readOn ?? e.createdAt.slice(0, 10);
  return (
    <li className="review">
      <Link to={`/book/${e.book.id}`} className="review__cover" tabIndex={-1} aria-hidden="true">
        <Cover book={e.book} size="sm" />
      </Link>
      <div className="review__body">
        <h3 className="review__title">
          <Link to={`/book/${e.book.id}`}>{e.book.title}</Link>
          {e.book.year && <span className="title-year"> {e.book.year}</span>}
        </h3>
        <div className="review__line">
          {e.rating && <Stars value={e.rating} size={13} compact />}
          {e.liked && <HeartIcon size={13} className="heart" />}
          <span className="muted small">
            {e.isReread ? 'Re-read' : 'Read'} by {by} · {formatDate(date)}
          </span>
        </div>
        {e.hasSpoiler ? (
          <details className="spoiler">
            <summary>This review contains spoilers — show anyway</summary>
            <p className="review__text">{e.review}</p>
          </details>
        ) : (
          <p className="review__text">{e.review}</p>
        )}
        {e.tags.length > 0 && (
          <div className="tag-row">
            {e.tags.map((t) => <span key={t} className="tag tag--sm">{t}</span>)}
          </div>
        )}
      </div>
    </li>
  );
}

function Empty({ isMe, me, other, children }: { isMe: boolean; me: string; other: string; children?: ReactNode }) {
  return (
    <div className="profile-empty">
      <p className="muted">{isMe ? me : other}</p>
      {children}
    </div>
  );
}
