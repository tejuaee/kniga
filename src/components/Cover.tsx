import { useState } from 'react';
import type { Book } from '../api';

// Pastel cover colours from the Figma palette (linen, beige, sky blue, navy grey, smoky grey).
const PALETTE = ['#A9C4D9', '#D8B98F', '#E8DCCB', '#BCD7E6', '#C4B5A2', '#B8C2CC', '#D9CBB3', '#9FB3C8'];

function colorFor(title: string) {
  let h = 0;
  for (const c of title) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** Real Open Library cover when there is one, otherwise the typographic placeholder from the design. */
export function Cover({ book, size = 'md' }: { book: Pick<Book, 'title' | 'author' | 'coverUrl'>; size?: 'xs' | 'sm' | 'md' | 'lg' }) {
  const [broken, setBroken] = useState(false);
  if (book.coverUrl && !broken) {
    return (
      <div className={`cover cover--${size}`}>
        <img src={book.coverUrl} alt={`Cover of ${book.title}`} loading="lazy" onError={() => setBroken(true)} />
      </div>
    );
  }
  return (
    <div className={`cover cover--${size} cover--type`} style={{ background: colorFor(book.title) }} role="img" aria-label={`Cover of ${book.title}`}>
      <span className="cover__title">{book.title}</span>
      {book.author && <span className="cover__author">{book.author}</span>}
    </div>
  );
}
