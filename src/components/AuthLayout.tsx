import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api, type Book } from '../api';
import { Logo } from './Logo';
import { Cover } from './Cover';
import { ChevronIcon } from './Icons';

// Matches the Figma "Login — Desktop 16:9" frame: form card on the left,
// "Featured this week" shelf + "Browse the stacks" on the right (Open Library inspired).
const SUBJECTS = [
  { name: 'Classics', ab: 'Cl', tone: 'beige' },
  { name: 'Science Fiction', ab: 'Sf', tone: 'sky' },
  { name: 'Fantasy', ab: 'Fa', tone: 'linen' },
  { name: 'Mystery & Thriller', ab: 'My', tone: 'sky' },
  { name: 'Philosophy', ab: 'Ph', tone: 'linen' },
  { name: 'Romance', ab: 'Ro', tone: 'beige' },
];

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth">
      <header className="auth__top">
        <Logo />
        <nav className="auth__links">
          <Link to="/login">Log in</Link>
          <Link to="/signup" className="btn btn--secondary btn--sm">Create account</Link>
        </nav>
      </header>
      <main className="auth__main">
        <section className="auth-card">{children}</section>
        <FeaturedWindow />
      </main>
      <footer className="auth__footer">
        <span>Book data and covers from Open Library</span>
        <span>Kniga · {new Date().getFullYear()}</span>
      </footer>
    </div>
  );
}

function FeaturedWindow() {
  const [books, setBooks] = useState<Book[]>([]);
  const shelf = useRef<HTMLDivElement>(null);
  useEffect(() => {
    api<{ books: Book[] }>('/books/featured').then((r) => setBooks(r.books)).catch(() => {});
  }, []);
  const scroll = (dir: number) => shelf.current?.scrollBy({ left: dir * 260, behavior: 'smooth' });

  return (
    <aside className="featured" aria-label="Featured books">
      <div className="featured__head">
        <div>
          <p className="eyebrow">Featured this week</p>
          <h2 className="featured__title">Books readers are logging</h2>
        </div>
        <div className="featured__arrows">
          <button className="round-btn" onClick={() => scroll(-1)} aria-label="Scroll left"><ChevronIcon dir="left" /></button>
          <button className="round-btn" onClick={() => scroll(1)} aria-label="Scroll right"><ChevronIcon dir="right" /></button>
        </div>
      </div>
      <div className="shelf">
        <div className="shelf__books" ref={shelf}>
          {books.map((b) => (
            <figure key={b.id} className="shelf__book">
              <Cover book={b} size="md" />
              <figcaption>
                <strong>{b.title}</strong>
                <span className="muted">{b.author}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
      <div className="stacks">
        <div className="stacks__head">
          <p className="eyebrow">Browse the stacks</p>
          <span className="muted small">58 books in the starting catalog</span>
        </div>
        <div className="stacks__grid">
          {SUBJECTS.map((s) => (
            <div key={s.name} className="subject">
              <span className={`subject__icon tone-${s.tone}`}>{s.ab}</span>
              <strong>{s.name}</strong>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
