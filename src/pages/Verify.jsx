import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { AuthLayout } from '../components/AuthLayout';

export function Verify() {
  const [params] = useSearchParams();
  const { user, refresh } = useAuth();
  const [state, setState] = useState('working');
  const [message, setMessage] = useState('');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // StrictMode runs effects twice; the token is single-use
    ran.current = true;
    api('/auth/verify', 'POST', { token: params.get('token') ?? '' })
      .then(() => {
        setState('ok');
        refresh().catch(() => {});
      })
      .catch((err) => {
        setState('error');
        setMessage(err instanceof ApiError ? err.message : 'Something went wrong.');
      });
  }, [params, refresh]);

  return (
    <AuthLayout>
      <div className="auth-form">
        <p className="eyebrow">Email confirmation</p>
        {state === 'working' && <h1 className="serif-title serif-title--xl">Confirming…</h1>}
        {state === 'ok' && (
          <>
            <h1 className="serif-title serif-title--xl">You're all set</h1>
            <p className="lead">Your email is confirmed.</p>
            <Link className="btn btn--primary btn--block" to={user ? '/' : '/login'}>
              {user ? 'Go to your shelves' : 'Log in'}
            </Link>
          </>
        )}
        {state === 'error' && (
          <>
            <h1 className="serif-title serif-title--xl">Link didn't work</h1>
            <p className="lead">{message} Log in and use “Resend link” to get a new one.</p>
            <Link className="btn btn--secondary btn--block" to="/">
              Back to Kniga
            </Link>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
