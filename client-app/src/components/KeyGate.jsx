import { useState } from 'react';

// The default landing screen for the client app: enter the access key
// provided by the admin to open the dashboard in client mode.
export default function KeyGate({ onSubmit, error }) {
  const [key, setKey] = useState('');

  return (
    <div className="gate">
      <div className="gate-card">
        <div className="brand big">
          <span className="logo">◢</span> प्रतिविम्ब
        </div>
        <p className="muted">Powerline inspection — client access</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (key.trim()) onSubmit(key.trim().toUpperCase());
          }}
        >
          <label>Access key</label>
          <input
            autoFocus
            placeholder="e.g. TWR-DEMO1234"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          {error && <div className="error">{error}</div>}
          <button type="submit">View my projects</button>
        </form>
        <p className="hint">Don’t have a key? Ask your project administrator.</p>
      </div>
    </div>
  );
}
