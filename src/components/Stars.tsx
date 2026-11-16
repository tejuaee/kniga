import { useState } from 'react';

const STAR = 'M12 2.5l2.94 6.1 6.56.9-4.78 4.6 1.17 6.5L12 17.4l-5.89 3.2 1.17-6.5L2.5 9.5l6.56-.9z';

function Star({ fill, size }: { fill: 0 | 0.5 | 1; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="star">
      <path d={STAR} className="star__empty" />
      {fill > 0 && (
        <path d={STAR} className="star__full" style={fill === 0.5 ? { clipPath: 'inset(0 50% 0 0)' } : undefined} />
      )}
    </svg>
  );
}

const fillAt = (value: number, i: number): 0 | 0.5 | 1 => (value >= i + 1 ? 1 : value >= i + 0.5 ? 0.5 : 0);

export function formatRating(r: number) {
  return '★'.repeat(Math.floor(r)) + (r % 1 ? '½' : '');
}

/** Read-only stars. Hides empty stars like Letterboxd's diary when `compact`. */
export function Stars({ value, size = 14, compact = false }: { value: number; size?: number; compact?: boolean }) {
  const count = compact ? Math.ceil(value) : 5;
  return (
    <span className="stars" aria-label={`${value} out of 5 stars`} role="img">
      {Array.from({ length: count }, (_, i) => (
        <Star key={i} fill={fillAt(value, i)} size={size} />
      ))}
    </span>
  );
}

/**
 * Rating input (UC-06): click the left half of a star for a half star.
 * Clicking the current value again clears it. Arrow keys move in half-star steps.
 */
export function StarInput({ value, onChange, size = 30 }: { value: number | null; onChange: (v: number | null) => void; size?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;
  const set = (v: number) => onChange(v === value ? null : v);

  return (
    <div
      className="star-input"
      role="slider"
      tabIndex={0}
      aria-label="Rating"
      aria-valuemin={0}
      aria-valuemax={5}
      aria-valuenow={value ?? 0}
      aria-valuetext={value ? `${value} stars` : 'No rating'}
      onMouseLeave={() => setHover(null)}
      onKeyDown={(e) => {
        const v = value ?? 0;
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); onChange(Math.min(5, v + 0.5)); }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); onChange(v <= 0.5 ? null : v - 0.5); }
        if (e.key === 'Backspace' || e.key === 'Delete') onChange(null);
      }}
    >
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className="star-input__star" style={{ width: size, height: size }}>
          <Star fill={fillAt(shown, i)} size={size} />
          <button type="button" tabIndex={-1} className="star-input__half star-input__half--left" aria-label={`${i + 0.5} stars`}
            onMouseEnter={() => setHover(i + 0.5)} onClick={() => set(i + 0.5)} />
          <button type="button" tabIndex={-1} className="star-input__half star-input__half--right" aria-label={`${i + 1} stars`}
            onMouseEnter={() => setHover(i + 1)} onClick={() => set(i + 1)} />
        </span>
      ))}
    </div>
  );
}
