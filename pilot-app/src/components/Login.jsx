import { useState } from 'react';
import { login } from '../api';
import { withRetry } from './WarmUp.jsx';

export default function Login({ onLogin }) {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [connecting, setConnecting] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    setConnecting(false);
    try {
      const user = await withRetry(
        () => login(loginId.trim(), password),
        () => setConnecting(true), // show "Connecting…" on first retry
      );
      onLogin(user);
    } catch (err) {
      setConnecting(false);
      setError(err.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const buttonLabel = connecting ? 'Connecting…' : busy ? 'Signing in…' : 'Sign in';

  return (
    <div className="gate">
      <form className="gate-card" onSubmit={submit}>
        <div className="brand big">
          <img src="/logo.png" className="brand-logo" alt="प्रतिबिम्ब:" />
          <span className="brand-subtitle">Pilot Login</span>
        </div>
        <label>Pilot ID</label>
        <input autoFocus value={loginId} onChange={(e) => setLoginId(e.target.value)} placeholder="pilot1" />
        <label>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••"
        />
        {error && <div className="error">{error}</div>}
        <button disabled={busy} type="submit">{buttonLabel}</button>
        {connecting && (
          <p className="hint">Server is warming up — retrying automatically…</p>
        )}
      </form>
    </div>
  );
}
