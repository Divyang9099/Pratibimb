import { useEffect, useState } from 'react';
import { api } from '../api';

const today = () => new Date().toISOString().slice(0, 10);

function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  });
}

async function fileToDataUri(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1200;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
        else { width = Math.round(width * MAX / height); height = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = reject;
    img.src = url;
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

  // Both Start Day and End Day use today-status for the selected date.
  // Changing the date re-checks — pilot can log any date freely.
  useEffect(() => {
    if (!projectId) { setStatus(null); return; }
    let active = true;
    setStatusLoading(true);
    setMsg(null);
    api.get(`/pilot/today-status/${projectId}`, { params: { date } })
      .then(r => { if (active) setStatus(r.data); })
      .catch(() => { if (active) setStatus(null); })
      .finally(() => { if (active) setStatusLoading(false); });
    return () => { active = false; };
  }, [projectId, isStart, date]);

  // Reset form fields when date or project changes.
  useEffect(() => {
    setTowerNo('');
    setImage('');
    setNote('');
    setIsNonWorking(false);
    setMsg(null);
  }, [projectId, date, isStart]);

  async function submit(e) {
    e.preventDefault();
    setMsg(null);
    if (!projectId) { setMsg({ type: 'err', text: 'Select a project first' }); return; }
    if (!isNonWorking && !towerNo) { setMsg({ type: 'err', text: 'Tower number is required' }); return; }
    if (isNonWorking && !note.trim()) {
      setMsg({ type: 'err', text: 'Please enter a reason for the non-working day.' });
      return;
    }
    setBusy(true);
    try {
      await api.post(`/pilot/${isStart ? 'start-day' : 'end-day'}`, {
        projectId, date, towerNo, image, note,
        ...(isStart && isNonWorking ? { nonWorking: true } : {}),
      });
      setMsg({
        type: 'ok',
        text: isNonWorking
          ? `Non-working day logged for ${fmtDate(date)}.`
          : isStart
            ? `Day started at tower ${towerNo}. Head to the field!`
            : `Day ended at tower ${towerNo}. Now submit your data records.`,
      });
      setTowerNo('');
      setImage('');
      setNote('');
      // Refresh status for this date
      const r = await api.get(`/pilot/today-status/${projectId}`, { params: { date } });
      setStatus(r.data);
      if (!isStart) setTimeout(() => onDayEnded?.(), 1200);
    } catch (err) {
      setMsg({ type: 'err', text: err.response?.data?.error || 'Failed to save' });
    } finally {
      setBusy(false);
    }
  }

  // Derive what to show from status for the selected date.
  const s = status;
  const canAct = isStart
    ? s && !s.started && !s.nonWorking          // Start: date not yet started
    : s && s.started && !s.ended && !s.nonWorking; // End: started but not ended

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

      {/* Date — always editable; changing it re-checks status */}
      {projectId && (
        <div className="form" style={{ marginBottom: 14 }}>
          <label>Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      )}

      {/* Status banners */}
      {projectId && statusLoading && (
        <div className="status-banner loading">Checking status…</div>
      )}

      {/* Start Day banners */}
      {projectId && !statusLoading && s && isStart && s.nonWorking && (
        <div className="status-banner warn">
          <strong>Non-working day already logged</strong> for {fmtDate(s.nonWorkingLog?.date)}.
          {s.nonWorkingLog?.note && <> Reason: "{s.nonWorkingLog.note}"</>}
        </div>
      )}
      {projectId && !statusLoading && s && isStart && s.started && (
        <div className="status-banner warn">
          <strong>Day already started</strong> at tower {s.startLog?.towerNo} — {fmtTime(s.startLog?.createdAt)}.
          {s.ended ? ' Session complete — go to Data Update.' : ' Go to End Day to close the session.'}
        </div>
      )}

      {/* End Day banners */}
      {projectId && !statusLoading && s && !isStart && s.nonWorking && (
        <div className="status-banner warn">
          <strong>Non-working day</strong> logged for {fmtDate(s.nonWorkingLog?.date)}. No field close required.
        </div>
      )}
      {projectId && !statusLoading && s && !isStart && !s.started && !s.nonWorking && (
        <div className="status-banner err">
          No Start Day found for this date. <strong>Start Day</strong> first.
        </div>
      )}
      {projectId && !statusLoading && s && !isStart && s.ended && (
        <div className="status-banner warn">
          <strong>Day already ended</strong> at tower {s.endLog?.towerNo} — {fmtTime(s.endLog?.createdAt)}.
          Go to Data Update to submit records.
        </div>
      )}
      {projectId && !statusLoading && s && !isStart && s.started && !s.ended && (
        <div className="status-banner ok">
          Day in progress since {fmtTime(s.startLog?.createdAt)} (tower {s.startLog?.towerNo}).
          Fill in below to close the day.
        </div>
      )}

      {/* Entry form — only shown when the pilot can actually act */}
      {canAct && (
        <form className="form" onSubmit={submit} style={{ marginTop: 12 }}>

          {/* Non-working toggle — Start Day only */}
          {isStart && (
            <div
              className={`nwd-toggle${isNonWorking ? ' active' : ''}`}
              onClick={() => { setIsNonWorking(v => !v); setTowerNo(''); setImage(''); }}
            >
              <span className="nwd-toggle-icon">{isNonWorking ? '✕' : '+'}</span>
              <span>{isNonWorking ? 'Working day (tap to switch back)' : 'Mark as Non-Working Day'}</span>
            </div>
          )}

          {isNonWorking && (
            <div className="status-banner warn" style={{ marginBottom: 0 }}>
              No field work today — a reason is required before submitting.
            </div>
          )}

          {/* Tower number — hidden for non-working */}
          {!isNonWorking && (
            <>
              <label>{isStart ? 'Start tower no.' : 'Close tower no.'}</label>
              <input
                value={towerNo}
                onChange={(e) => setTowerNo(e.target.value)}
                placeholder="e.g. 23"
              />
            </>
          )}

          {/* Image — hidden for non-working */}
          {!isNonWorking && (
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

          <label>{isNonWorking ? 'Reason *' : 'Note (optional)'}</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder={isNonWorking ? 'e.g. Public holiday, Rain, Site access denied…' : ''}
            style={isNonWorking ? { borderColor: note.trim() ? undefined : 'var(--yellow)' } : undefined}
          />

          {msg && <div className={msg.type === 'ok' ? 'ok' : 'error'}>{msg.text}</div>}
          <button disabled={busy} type="submit">
            {busy ? 'Saving…' : isNonWorking ? 'Log Non-Working Day' : isStart ? 'Start Day' : 'End Day'}
          </button>
        </form>
      )}

      {/* Success message shown after submit (form hidden after status refresh) */}
      {!canAct && msg?.type === 'ok' && (
        <div className="ok" style={{ marginTop: 10 }}>{msg.text}</div>
      )}
    </div>
  );
}
