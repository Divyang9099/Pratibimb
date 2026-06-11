import { useEffect, useRef, useState } from 'react';
import { api } from '../api';

const today = () => new Date().toISOString().slice(0, 10);

function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

async function fileToDataUri(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export default function StartEndDay({ mode, projects, projectId, onProjectChange, onDayEnded }) {
  const isStart = mode === 'start';

  const [date, setDate] = useState(today());
  const [towerNo, setTowerNo] = useState('');
  const [image, setImage] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(false);

  // Start Day: re-check status when project or date changes.
  useEffect(() => {
    if (!projectId || !isStart) {
      if (!projectId) setStatus(null);
      return;
    }
    let active = true;
    setStatusLoading(true);
    api.get(`/pilot/today-status/${projectId}`, { params: { date } })
      .then(r => { if (active) setStatus(r.data); })
      .catch(() => { if (active) setStatus(null); })
      .finally(() => { if (active) setStatusLoading(false); });
    return () => { active = false; };
  }, [projectId, isStart, date]);

  // End Day: find the most recent unended session; auto-populate date from it.
  // Date is NOT in deps so setting it from the response doesn't cause a re-fetch.
  useEffect(() => {
    if (!projectId || isStart) {
      if (!projectId) { setStatus(null); setDate(today()); }
      return;
    }
    let active = true;
    setStatusLoading(true);
    api.get(`/pilot/active-session/${projectId}`)
      .then(r => {
        if (!active) return;
        const s = r.data;
        if (s.session) setDate(s.session.date.slice(0, 10));
        setStatus({ started: !!s.session, ended: s.ended, startLog: s.session || null, endLog: s.endLog || null });
      })
      .catch(() => { if (active) setStatus(null); })
      .finally(() => { if (active) setStatusLoading(false); });
    return () => { active = false; };
  }, [projectId, isStart]);

  // Populate form fields when an existing entry is shown (frozen mode).
  const prevFrozenRef = useRef(false);
  useEffect(() => {
    const logToDisplay = isStart ? status?.startLog : status?.endLog;
    const isFrozen = isStart ? !!status?.started : !!status?.ended;
    if (isFrozen && logToDisplay) {
      setTowerNo(logToDisplay.towerNo || '');
      setImage(logToDisplay.image || '');
      setNote(logToDisplay.note || '');
    } else if (!isFrozen && prevFrozenRef.current) {
      setTowerNo('');
      setImage('');
      setNote('');
    }
    prevFrozenRef.current = isFrozen;
  }, [status, isStart]);

  async function submit(e) {
    e.preventDefault();
    setMsg(null);
    if (!projectId || !towerNo) {
      setMsg({ type: 'err', text: 'Project and tower number are required' });
      return;
    }
    setBusy(true);
    try {
      await api.post(`/pilot/${isStart ? 'start-day' : 'end-day'}`, { projectId, date, towerNo, image, note });
      setMsg({
        type: 'ok',
        text: isStart
          ? `Day started at tower ${towerNo}. Head to the field!`
          : `Day ended at tower ${towerNo}. Now submit your data records.`,
      });
      setTowerNo('');
      setImage('');
      setNote('');
      if (isStart) {
        const r = await api.get(`/pilot/today-status/${projectId}`, { params: { date } });
        setStatus(r.data);
      } else {
        const r = await api.get(`/pilot/active-session/${projectId}`);
        setStatus({ started: !!r.data.session, ended: r.data.ended, startLog: r.data.session, endLog: r.data.endLog });
        setTimeout(() => onDayEnded?.(), 1200);
      }
    } catch (err) {
      setMsg({ type: 'err', text: err.response?.data?.error || 'Failed to save' });
    } finally {
      setBusy(false);
    }
  }

  const isFrozen = isStart ? !!status?.started : !!status?.ended;
  const notYetStarted = !status?.started && !isStart;

  return (
    <div className="card">
      <h2>{isStart ? 'Start Day' : 'End Day'}</h2>
      <p className="muted">
        {isStart
          ? 'Log the morning field open: where you begin today.'
          : 'Log the evening close: the last tower covered today.'}
      </p>

      <div className="form" style={{ marginBottom: 12 }}>
        <label>Project</label>
        <select value={projectId} onChange={(e) => onProjectChange(e.target.value)}>
          <option value="">Select project…</option>
          {projects.map((p) => (
            <option key={p._id} value={p._id}>{p.name}</option>
          ))}
        </select>
      </div>

      {projectId && statusLoading && (
        <div className="status-banner loading">Checking status…</div>
      )}

      {projectId && !statusLoading && status && isStart && status.started && (
        <div className="status-banner warn">
          <strong>Day already started</strong> at tower {status.startLog?.towerNo} —{' '}
          {fmtDate(status.startLog?.date)} at {fmtTime(status.startLog?.createdAt)}.
          {status.ended
            ? ' Session complete — go to Data Update to submit records.'
            : ' End your session before starting a new one.'}
        </div>
      )}

      {projectId && !statusLoading && status && !isStart && !status.started && (
        <div className="status-banner err">
          You must <strong>Start Day</strong> first before ending it.
        </div>
      )}
      {projectId && !statusLoading && status && !isStart && status.started && status.ended && (
        <div className="status-banner warn">
          <strong>Day already ended</strong> at tower {status.endLog?.towerNo} at{' '}
          {fmtTime(status.endLog?.createdAt)}. Go to Data Update to submit your records.
        </div>
      )}
      {projectId && !statusLoading && status && !isStart && status.started && !status.ended && (
        <div className="status-banner ok">
          Day in progress since {fmtTime(status.startLog?.createdAt)} (started at tower{' '}
          {status.startLog?.towerNo}). Fill in below to close the day.
        </div>
      )}

      {!notYetStarted && (
        <form className="form" onSubmit={submit} style={{ marginTop: 12 }}>
          <label>Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => { if (isStart && !isFrozen) setDate(e.target.value); }}
            disabled={isFrozen || !isStart}
          />

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

      {notYetStarted && msg?.type === 'ok' && (
        <div className="ok" style={{ marginTop: 10 }}>{msg.text}</div>
      )}
    </div>
  );
}
