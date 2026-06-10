import { useEffect, useState } from 'react';
import { api } from '../api';

const today = () => new Date().toISOString().slice(0, 10);

function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function fileToDataUri(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// Shared form for Start Day (morning open) and End Day (evening close).
// Enforces lifecycle: a day must be started before it can be ended,
// and cannot be started twice.
export default function StartEndDay({ mode, projects, projectId, onProjectChange, onDayEnded }) {
  const isStart = mode === 'start';

  const [date, setDate] = useState(today());
  const [towerNo, setTowerNo] = useState('');
  const [image, setImage] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  // Today's lifecycle status for this project.
  const [status, setStatus] = useState(null); // { started, ended, startLog, endLog }
  const [statusLoading, setStatusLoading] = useState(false);

  // Re-check status whenever the project or date changes.
  useEffect(() => {
    if (!projectId) { setStatus(null); return; }
    setStatusLoading(true);
    api
      .get(`/pilot/today-status/${projectId}`, { params: { date } })
      .then((r) => setStatus(r.data))
      .catch(() => setStatus(null))
      .finally(() => setStatusLoading(false));
  }, [projectId, date]);

  const logToDisplay = isStart ? status?.startLog : status?.endLog;
  const isFrozen = isStart ? !!status?.started : !!status?.ended;

  // Update state values when status updates to populate frozen form
  useEffect(() => {
    if (isFrozen && logToDisplay) {
      if (logToDisplay.date) {
        setDate(logToDisplay.date.slice(0, 10));
      }
      setTowerNo(logToDisplay.towerNo || '');
      setImage(logToDisplay.image || '');
      setNote(logToDisplay.note || '');
    } else if (!isFrozen) {
      setTowerNo('');
      setImage('');
      setNote('');
    }
  }, [status, isFrozen, isStart]);

  async function submit(e) {
    e.preventDefault();
    setMsg(null);
    if (!projectId || !towerNo) {
      setMsg({ type: 'err', text: 'Project and tower number are required' });
      return;
    }
    setBusy(true);
    try {
      await api.post(`/pilot/${isStart ? 'start-day' : 'end-day'}`, {
        projectId,
        date,
        towerNo,
        image,
        note,
      });
      setMsg({
        type: 'ok',
        text: isStart
          ? `Day started at tower ${towerNo}. Head to the field!`
          : `Day ended at tower ${towerNo}. Now submit your data records.`,
      });
      setTowerNo('');
      setImage('');
      setNote('');
      // Refresh the status banner immediately after submit.
      const r = await api.get(`/pilot/today-status/${projectId}`, { params: { date } });
      setStatus(r.data);
      // After ending the day, switch to the Data Update tab.
      if (!isStart) setTimeout(() => onDayEnded?.(), 1200);
    } catch (err) {
      setMsg({ type: 'err', text: err.response?.data?.error || 'Failed to save' });
    } finally {
      setBusy(false);
    }
  }

  // Compute the lifecycle state for this tab.
  const alreadyStarted = status?.started && isStart;
  const alreadyEnded   = status?.ended && !isStart;
  const notYetStarted  = !status?.started && !isStart;
  // The form is hidden only when they try to end the day before starting it.
  const formHidden = notYetStarted;

  return (
    <div className="card">
      <h2>{isStart ? 'Start Day' : 'End Day'}</h2>
      <p className="muted">
        {isStart
          ? 'Log the morning field open: where you begin today.'
          : 'Log the evening close: the last tower covered today.'}
      </p>

      {/* ---- Project selector ---- */}
      <div className="form" style={{ marginBottom: 12 }}>
        <label>Project</label>
        <select value={projectId} onChange={(e) => onProjectChange(e.target.value)}>
          <option value="">Select project…</option>
          {projects.map((p) => (
            <option key={p._id} value={p._id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* ---- Lifecycle status banners ---- */}
      {projectId && statusLoading && (
        <div className="status-banner loading">Checking status…</div>
      )}

      {projectId && status && isStart && status.started && (
        <div className="status-banner warn">
          <strong>Day already started</strong> at tower {status.startLog?.towerNo} at{' '}
          {fmtTime(status.startLog?.createdAt)}.
          {status.ended
            ? ' Today\'s session is complete — go to Data Update to submit records.'
            : ' End your session before starting a new one.'}
        </div>
      )}

      {projectId && status && !isStart && !status.started && (
        <div className="status-banner err">
          You must <strong>Start Day</strong> first before ending it.
        </div>
      )}

      {projectId && status && !isStart && status.started && status.ended && (
        <div className="status-banner warn">
          <strong>Day already ended</strong> at tower {status.endLog?.towerNo} at{' '}
          {fmtTime(status.endLog?.createdAt)}. Go to Data Update to submit your records.
        </div>
      )}

      {projectId && status && !isStart && status.started && !status.ended && (
        <div className="status-banner ok">
          Day in progress since {fmtTime(status.startLog?.createdAt)} (started at tower{' '}
          {status.startLog?.towerNo}). Fill in below to close the day.
        </div>
      )}

      {/* ---- Entry form (hidden when blocked) ---- */}
      {!formHidden && (
        <form className="form" onSubmit={submit} style={{ marginTop: 12 }}>
          <label>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={isFrozen} />

          <label>{isStart ? 'Start tower no.' : 'Close tower no.'}</label>
          <input
            value={towerNo}
            onChange={(e) => setTowerNo(e.target.value)}
            placeholder="e.g. 23"
            disabled={isFrozen}
          />

          {!isFrozen && (
            <>
              <label>Field image</label>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) setImage(await fileToDataUri(f));
                }}
              />
            </>
          )}
          {image && <img className="preview" src={image} alt="preview" />}

          <label>Note (optional)</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} disabled={isFrozen} />

          {msg && <div className={msg.type === 'ok' ? 'ok' : 'error'}>{msg.text}</div>}
          {!isFrozen && (
            <button disabled={busy} type="submit">
              {busy ? 'Saving…' : isStart ? 'Start Day' : 'End Day'}
            </button>
          )}
        </form>
      )}

      {/* Success message even when form is hidden */}
      {formHidden && msg?.type === 'ok' && <div className="ok" style={{ marginTop: 10 }}>{msg.text}</div>}
    </div>
  );
}
