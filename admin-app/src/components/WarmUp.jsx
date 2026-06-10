import { useEffect, useState } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5050/api';

// Pings /health until the backend responds, then calls onReady().
// Shows a friendly "waking up" screen while waiting (Render free tier
// spins down after inactivity and takes ~30–50 s to cold-start).
export default function WarmUp({ onReady }) {
  const [dots, setDots] = useState('');
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    async function ping() {
      try {
        const res = await fetch(`${API}/health`, { signal: AbortSignal.timeout(8000) });
        if (res.ok && !cancelled) { onReady(); return; }
      } catch { /* still waking */ }
      if (!cancelled) {
        attempts += 1;
        setElapsed(attempts * 5);
        setTimeout(ping, 5000);
      }
    }

    ping();
    const dotTimer = setInterval(() => setDots((d) => (d.length >= 3 ? '' : d + '.')), 500);
    return () => { cancelled = true; clearInterval(dotTimer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="warmup-screen">
      <div className="warmup-card">
        <div className="warmup-spinner" />
        <div className="warmup-title">
          <span className="logo">◢</span> प्रतिविम्ब
        </div>
        <p className="warmup-msg">Waking up server{dots}</p>
        {elapsed >= 10 && (
          <p className="warmup-sub">
            Free server is starting up — usually takes 30–60 s on first visit.
          </p>
        )}
        {elapsed > 0 && <p className="warmup-elapsed">{elapsed}s</p>}
      </div>
    </div>
  );
}
