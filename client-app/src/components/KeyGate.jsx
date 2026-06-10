import { useState } from 'react';
import { withRetry } from './WarmUp.jsx';

// The default landing screen for the client app: enter the access key
// provided by the admin to open the dashboard in client mode.
// onSubmit receives the uppercased key and must return a Promise.
export default function KeyGate({ onSubmit, error }) {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [localError, setLocalError] = useState('');

  async function submit(e) {
    e.preventDefault();
    const k = key.trim().toUpperCase();
    if (!k) return;
    setBusy(true);
    setConnecting(false);
    setLocalError('');
    try {
      await withRetry(
        () => onSubmit(k),
        () => setConnecting(true),
      );
    } catch {
      // errors are surfaced via the `error` prop from App
    } finally {
      setBusy(false);
      setConnecting(false);
    }
  }

  const buttonLabel = connecting ? 'Connecting…' : busy ? 'Checking…' : 'View my projects';
  const displayError = error || localError;

  return (
    <div className="gate">
      <div className="gate-card">
        <div className="brand big">
          <img src="/favicon.png" className="logo-img" alt="logo" /> प्रतिविम्ब:
        </div>
        <p className="muted">Powerline inspection — client access</p>
        <form onSubmit={submit}>
          <label>Access key</label>
          <input
            autoFocus
            placeholder="e.g. TWR-DEMO1234"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            disabled={busy}
          />
          {displayError && <div className="error">{displayError}</div>}
          <button type="submit" disabled={busy}>{buttonLabel}</button>
          {connecting && (
            <p className="hint">Server is warming up — retrying automatically…</p>
          )}
        </form>
        <p className="hint">Don't have a key? Ask your project administrator.</p>
      </div>
    </div>
  );
}
