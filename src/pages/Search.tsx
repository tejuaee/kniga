import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, type Book, type MemberResult } from '../api';
import { Cover } from '../components/Cover';
import { SearchIcon } from '../components/Icons';

type Tab = 'books' | 'readers';

type Results =
  | { tab: 'books'; books: Book[]; note: string | null }
  | { tab: 'readers'; readers: MemberResult[]; note: string | null };

const TABS: { id: Tab; label: string; placeholder: string }[] = [
  { id: 'books', label: 'Books', placeholder: 'Title, author or ISBN' },
  { id: 'readers', label: 'Readers', placeholder: 'Username' },
];

/**
 * Two separate searches: books and readers. Only the active tab is queried.
 * Query and tab live in the URL (?q=…&type=readers) so results can be linked and reloaded.
 */
export function Search() {
  const [params, setParams] = useSearchParams();
  const urlQ = params.get('q') ?? '';
  const tab: Tab = params.get('type') === 'readers' ? 'readers' : 'books';
  const [q, setQ] = useState(urlQ);
  const [results, setResults] = useState<Results | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Nav search submits a new ?q= while this page is open. Keep in-progress spaces while typing.
  useEffect(() => setQ((cur) => (cur.trim() === urlQ ? cur : urlQ)), [urlQ]);
  useEffect(() => inputRef.current?.focus(), [tab]);

  const writeUrl = (query: string, t: Tab) => {
    const next: Record<string, string> = {};
    if (query) next.q = query;
    if (t === 'readers') next.type = 'readers';
    setParams(next, { replace: true });
  };

  useEffect(() => {
    const query = q.trim();
    if (query !== urlQ) writeUrl(query, tab);
    setResults(null);
    if (query.length < 2) return;

    let cancelled = false;
    const t = setTimeout(async () => {
      const enc = encodeURIComponent(query);
      let r: Results;
      try {
        if (tab === 'books') {
          const b = await api<{ results: Book[]; source: string; warning?: string }>(`/books/search?q=${enc}`);
          r = {
            tab,
            books: b.results,
            note: b.warning ?? (b.source === 'openlibrary' && b.results.length ? 'Not in Kniga yet — found on Open Library.' : null),
          };
        } else {
          const m = await api<{ results: MemberResult[] }>(`/users?q=${enc}`);
          r = { tab, readers: m.results, note: null };
        }
      } catch {
        r = tab === 'books'
          ? { tab, books: [], note: 'Search failed. Check your connection and try again.' }
          : { tab, readers: [], note: 'Search failed. Check your connection and try again.' };
      }
      if (!cancelled) setResults(r);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, tab]);

  const active = TABS.find((t) => t.id === tab)!;
  const count = results ? (results.tab === 'books' ? results.books.length : results.readers.length) : 0;

  return (
    <div className="page">
      <section>
        <p className="eyebrow">Search</p>
        <h1 className="serif-title serif-title--xl">Find books and readers</h1>
      </section>

      <div className="search-tabs" role="tablist" aria-label="What to search">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`search-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="search-panel"
            className="search-tabs__tab"
            onClick={() => writeUrl(q.trim(), t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div id="search-panel" role="tabpanel" aria-labelledby={`search-tab-${tab}`} className="search-panel">
        <label className="search-field search-page__field">
          <SearchIcon size={18} />
          <input
            ref={inputRef}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={active.placeholder}
            aria-label={`Search ${active.label.toLowerCase()}`}
          />
        </label>

        {q.trim().length < 2 ? (
          <p className="hint">Type at least two characters.</p>
        ) : !results ? (
          <p className="hint">Searching…</p>
        ) : (
          <>
            {results.note && <p className="hint">{results.note}</p>}
            {count === 0 && !results.note && (
              <div className="empty">
                <p className="serif-title">No {active.label.toLowerCase()} match “{q.trim()}”</p>
                <p className="muted">
                  {tab === 'books' ? "Try a different spelling, an author's surname, or an ISBN." : 'Check the spelling of the username.'}
                </p>
              </div>
            )}

            {results.tab === 'books' && results.books.length > 0 && (
              <section className="card-section">
                <ul className="search-books">
                  {results.books.map((b) => (
                    <li key={b.id}>
                      <Link to={`/book/${b.id}`} className="search-book">
                        <Cover book={b} size="lg" />
                        <span className="search-book__title">{b.title}</span>
                        <span className="muted small">
                          {b.author}
                          {b.year ? ` · ${b.year}` : ''}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {results.tab === 'readers' && results.readers.length > 0 && (
              <section className="card-section">
                <ul className="search-members">
                  {results.readers.map((m) => (
                    <li key={m.username}>
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
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
