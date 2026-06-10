// Utility: silently warms the backend in the background by pinging /health.
// No UI is rendered — call this once on app mount.
const API = import.meta.env.VITE_API_URL || 'http://localhost:5050/api';

export function warmBackend() {
  let tries = 0;
  function ping() {
    fetch(`${API}/health`, { signal: AbortSignal.timeout(6000) })
      .then((r) => { if (!r.ok) throw new Error(); })
      .catch(() => { if (tries++ < 20) setTimeout(ping, 5000); });
  }
  ping();
}

// Wraps an async API call with auto-retry on network/timeout failures.
// onRetry(attempt) is called before each retry so the UI can show "Connecting…".
export async function withRetry(fn, onRetry, maxRetries = 8) {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      const isNetwork = !err.response; // axios: no .response = network/timeout
      if (!isNetwork || i === maxRetries) throw err;
      onRetry(i + 1);
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
}
