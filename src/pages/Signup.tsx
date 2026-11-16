import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api';
import { useAuth } from '../auth';
import { AuthLayout } from '../components/AuthLayout';
import { PasswordField, TextField } from '../components/Fields';

export function Signup() {
  const { register } = useAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register(username.trim(), email.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, 'Could not reach Kniga. Check your connection.'));
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <form onSubmit={submit} noValidate className="auth-form">
        <div className="auth-form__intro">
          <p className="eyebrow">Join Kniga</p>
          <h1 className="serif-title serif-title--xl">Start your reading diary</h1>
          <p className="lead">Log every book you read, rate it, review it and keep your favourites in one place.</p>
        </div>
        {error && !Object.keys(error.fields).length && (
          <p className="form-error" role="alert">{error.message}</p>
        )}
        <TextField
          label="Username"
          value={username}
          onChange={setUsername}
          autoComplete="username"
          placeholder="bookworm_42"
          error={error?.fields.username}
          hint="3–20 letters, numbers or underscores."
          autoFocus
        />
        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          placeholder="you@example.com"
          error={error?.fields.email}
        />
        <PasswordField
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          error={error?.fields.password}
          hint="At least 8 characters, with a letter and a number."
        />
        <button className="btn btn--primary btn--block" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>
        <p className="auth-form__switch">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
