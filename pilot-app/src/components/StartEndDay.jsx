import { useEffect, useRef, useState } from 'react';
import { api } from '../api';

const today = () => new Date().toISOString().slice(0, 10);

function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
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
  const [isNonWorking, setIsNonWorking] = useState(false);
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
        setStatus({ started: !!s.session, ended: s.ended, nonWorking: s.nonWorking, startLog: s.session || null, endLog: s.endLog || null, nonWorkingLog: s.nonWorkingLog || null });
      })
      .catch(() => { if (active) setStatus(null); })
      .finally(() => { if (active) setStatusLoading(false); });
    return () => { active = false; };
  }, [projectId, isStart]);

  // Populate form fields when an existing entry is shown (frozen mode).
  const prevFrozenRef = useRef(false);
  useEffect(() => {
    const logToDisplay = isStart ? status?.startLog : status?.endLog;
    const isFrozen = isStart ? (!!status?.started || !!status?.nonWorking) : !!status?.ended;
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

  // Reset non-working toggle when date or project changes.
  useEffect(() => { setIsNonWorking(false); }, [projectId, date]);

  async function submit(e) {
    e.preventDefault();
    setMsg(null);
    if (!projectId) {
      setMsg({ type: 'err', text: 'Select a project first' });
      return;
    }
    if (!isNonWorking && !towerNo) {
      setMsg({ type: 'err', text: 'Tower number is required' });
      return;
    }
    setBusy(true);
    try {
      await api.post(`/pilot/${isStart ? 'start-day' : 'end-day'}`, {
        projectId, date, towerNo, image, note,
        ...(isStart && isNonWorking ? { nonWorking: true } : {}),
      });
      if (isStart && isNonWorking) {
        setMsg({ type: 'ok', text: `Non-working day logged for ${fmtDate(date)}.` });
      } else {
        setMsg({
          type: 'ok',
          text: isStart
            ? `Day started at tower ${towerNo}. Head to the field!`
            : `Day ended at tower ${towerNo}. Now submit your data records.`,
        });
      }
      setTowerNo('');
      setImage('');
      setNote('');
      if (isStart) {
        const r = await api.get(`/pilot/today-status/${projectId}`, { params: { date } });
        setStatus(r.data);
      } else {
        const r = await api.get(`/pilot/active-session/${projectId}`);
        setStatus({ started: !!r.data.session, ended: r.data.ended, nonWorking: r.data.nonWorking, startLog: r.data.session, endLog: r.data.endLog });
        setTimeout(() => onDayEnded?.(), 1200);
      }
    } catch (err) {
      setMsg({ type: 'err', text: err.response?.data?.error || 'Failed to save' });
    } finally {
      setBusy(false);
    }
  }

  const alreadyStarted  = isStart && !!status?.started;
  const alreadyNonWork  = isStart && !!status?.nonWorking;
  const isFrozenStart   = alreadyStarted || alreadyNonWork;
  const isFrozenEnd     = !isStart && !!status?.ended;
  const notYetStarted   = !isStart && !status?.started && !status?.nonWorking;
  const endDayNonWork   = !isStart && !!status?.nonWorking;

  const formHidden = notYetStarted || endDayNonWork;
  const isFrozen = isStart ? isFrozenStart : isFrozenEnd;

  return (
    <div className="card">
      <h2>{isStart ? 'Start Day' : 'End Day'}</h2>
      <p className="muted">
        {isStart
          ? 'Log the morning field open: where you begin today.'
          : 'Log the evening close: the last tower covered today.'}
      </p>

      {/* Project selector */}
      <div className="form" style={{ marginBottom: 14 }}>
        <label>Project</label>
        <select value={projectId} onChange={(e) => onProjectChange(e.target.value)}>
          <option value="">Select project…</option>
          {projects.map((p) => (
            <option key={p._id} value={p._id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* Status banners */}
      {projectId && statusLoading && (
        <div className="status-banner loading">Checking status…</div>
      )}

      {/* Start Day banners */}
      {projectId && !statusLoading && status && isStart && alreadyNonWork && (
        <div className="status-banner warn">
          <strong>Non-working day already logged</strong> for {fmtDate(status.nonWorkingLog?.date)}.
          {status.nonWorkingLog?.note && <> Reason: "{status.nonWorkingLog.note}"</>}
        </div>
      )}
      {projectId && !statusLoading && status && isStart && alreadyStarted && !alreadyNonWork && (
        <div className="status-banner warn">
          <strong>Day already started</strong> at tower {status.startLog?.towerNo} —{' '}
          {fmtDate(status.startLog?.date)} at {fmtTime(status.startLog?.createdAt)}.
          {status.ended ? ' Session complete — go to Data Update.' : ' End your session before starting a new one.'}
        </div>
      )}

      {/* End Day banners */}
      {projectId && !statusLoading && status && endDayNonWork && (
        <div className="status-banner warn">
          <strong>Non-working day</strong> was logged for {fmtDate(status.nonWorkingLog?.date)}.
          No field close required.
        </div>
      )}
      {projectId && !statusLoading && status && notYetStarted && (
        <div className="status-banner err">
          You must <strong>Start Day</strong> first before ending it.
        </div>
      )}
      {projectId && !statusLoading && status && !isStart && status.started && status.ended && (
        <div className="status-banner warn">
          <strong>Day already ended</strong> at tower {status.endLog?.towerNo} at{' '}
          {fmtTime(status.endLog?.createdAt)}. Go to Data Update to submit records.
        </div>
      )}
      {projectId && !statusLoading && status && !isStart && status.started && !status.ended && (
        <div className="status-banner ok">
          Day in progress since {fmtTime(status.startLog?.createdAt)} (started at tower{' '}
          {status.startLog?.towerNo}). Fill in below to close the day.
        </div>
      )}

      {/* Entry form */}
      {!formHidden && (
        <form className="form" onSubmit={submit} style={{ marginTop: 12 }}>

          {/* Non-working day toggle — only on Start Day, only when not already submitted */}
          {isStart && !isFrozen && (
            <div
              className={`nwd-toggle${isNonWorking ? ' active' : ''}`}
              onClick={() => { setIsNonWorking(v => !v); setTowerNo(''); setImage(''); }}
            >
              <span className="nwd-toggle-icon">{isNonWorking ? '✕' : '+'}</span>
              <span>{isNonWorking ? 'Working day (tap to switch back)' : 'Mark as Non-Working Day'}</span>
            </div>
          )}

          {isNonWorking && isStart && (
            <div className="status-banner warn" style={{ marginTop: 4, marginBottom: 0 }}>
              No field work today — only date and an optional reason are required.
            </div>
          )}

          <label>Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => { if (isStart && !isFrozen) setDate(e.target.value); }}
            disabled={isFrozen || !isStart}
          />

          {/* Tower number — hidden for non-working days */}
          {!isNonWorking && (
            <>
              <label>{isStart ? 'Start tower no.' : 'Close tower no.'}</label>
              <input
                value={towerNo}
                onChange={(e) => setTowerNo(e.target.value)}
                placeholder="e.g. 23"
                disabled={isFrozen}
              />
            </>
          )}

          {/* Image — hidden for non-working days */}
          {!isNonWorking && !isFrozen && (
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
          {image && !isNonWorking && <img className="preview" src={image} alt="preview" />}

          <label>{isNonWorking ? 'Reason (optional)' : 'Note (optional)'}</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} disabled={isFrozen}
            placeholder={isNonWorking ? 'e.g. Public holiday, Rain, Site access denied…' : ''} />

          {msg && <div className={msg.type === 'ok' ? 'ok' : 'error'}>{msg.text}</div>}
          {!isFrozen && (
            <button disabled={busy} type="submit">
              {busy ? 'Saving…' : isNonWorking ? 'Log Non-Working Day' : isStart ? 'Start Day' : 'End Day'}
            </button>
          )}
        </form>
      )}

      {(notYetStarted || endDayNonWork) && msg?.type === 'ok' && (
        <div className="ok" style={{ marginTop: 10 }}>{msg.text}</div>
      )}
    </div>
  );
}
