import { Stars } from './Stars';

const LABELS = ['½', '1', '1½', '2', '2½', '3', '3½', '4', '4½', '5'];

/**
 * Letterboxd-style ratings spread: one bar per half-star step, ★ on the left, ★★★★★ on the right.
 * Hover (or focus) a bar to see its count.
 */
export function RatingsChart({ counts }: { counts: number[] }) {
  const total = counts.reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...counts);
  const average = total ? counts.reduce((sum, n, i) => sum + n * (i + 1) * 0.5, 0) / total : null;

  const summary = total
    ? `${total} rated ${total === 1 ? 'book' : 'books'}, average ${average!.toFixed(1)} stars. ` +
      counts.map((n, i) => `${LABELS[i]} stars: ${n}`).join(', ')
    : 'No ratings yet';

  return (
    <figure className="ratings" aria-label={summary}>
      <div className="ratings__plot" aria-hidden="true">
        <span className="ratings__end"><Stars value={1} size={11} compact /></span>
        <div className="ratings__bars">
          {counts.map((n, i) => (
            <div key={i} className="ratings__col" title={`${LABELS[i]} ★ — ${n} ${n === 1 ? 'book' : 'books'}`}>
              <span className="ratings__count">{n || ''}</span>
              <span className="ratings__bar" style={{ height: `${(n / max) * 100}%` }} data-empty={n === 0 || undefined} />
            </div>
          ))}
        </div>
        <span className="ratings__end"><Stars value={5} size={11} compact /></span>
      </div>
      <figcaption className="ratings__caption">
        {total ? (
          <>
            <strong>{average!.toFixed(1)}</strong> average · {total} rated
          </>
        ) : (
          'Rate books in your diary to see your spread here.'
        )}
      </figcaption>
    </figure>
  );
}
