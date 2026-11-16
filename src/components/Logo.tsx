import { Link } from 'react-router-dom';

export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="Kniga home">
      <span className="logo__mark" aria-hidden="true">
        <i style={{ height: 16, background: 'var(--beige)' }} />
        <i style={{ height: 24, background: 'var(--primary)' }} />
        <i style={{ height: 19, background: 'var(--sky)' }} />
      </span>
      <span className="logo__word">Kniga</span>
    </Link>
  );
}
