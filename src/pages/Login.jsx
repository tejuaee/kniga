import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api';
import { useAuth } from '../auth';
import { AuthLayout } from '../components/AuthLayout';
import { PasswordField, TextField } from '../components/Fields';

export function Login() {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(identifier.trim(), password, remember);
      // <GuestOnly> redirects to ?next= or home once the user is set.
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, 'Could not reach Kniga. Check your connection.'));
      setBusy(false);
    }
  };

  return (
    <AuthLayout backdrop>
      <form onSubmit={submit} noValidate className="auth-form">
        <div className="auth-form__intro">
          <p className="eyebrow">Welcome back</p>
          <h1 className="serif-title serif-title--xl">Log in to your shelves</h1>
          <p className="lead">Pick up where you left off — your diary, ratings and reviews are waiting.</p>
        </div>
        {error && !Object.keys(error.fields).length && (
          <p className="form-error" role="alert">
            {error.message}
          </p>
        )}
        <TextField
          label="Email or username"
          value={identifier}
          onChange={setIdentifier}
          autoComplete="username"
          placeholder="you@example.com"
          error={error?.fields.identifier}
          autoFocus
        />
        <PasswordField
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          error={error?.fields.password}
        />
        <label className="check">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span>Keep me logged in</span>
        </label>
        <button className="btn btn--primary btn--block" disabled={busy}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>
        <p className="auth-form__switch">
          New to Kniga? <Link to="/signup">Create an account</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
