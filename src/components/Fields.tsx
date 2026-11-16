import { useId, useState } from 'react';
import { EyeIcon, EyeOffIcon } from './Icons';

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  autoComplete?: string;
  placeholder?: string;
  autoFocus?: boolean;
}

export function TextField({ label, value, onChange, error, hint, type = 'text', ...rest }: FieldProps & { type?: string }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="input"
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error || hint ? `${id}-msg` : undefined}
        {...rest}
      />
      {(error || hint) && (
        <p id={`${id}-msg`} className={error ? 'field-error' : 'hint'}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

export function PasswordField({ label, value, onChange, error, hint, ...rest }: FieldProps) {
  const id = useId();
  const [show, setShow] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="input input--with-btn">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error || hint ? `${id}-msg` : undefined}
          {...rest}
        />
        <button type="button" className="icon-btn" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>
          {show ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
        </button>
      </div>
      {(error || hint) && (
        <p id={`${id}-msg`} className={error ? 'field-error' : 'hint'}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
