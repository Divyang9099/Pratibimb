import Tower from '../models/Tower.js';
import DailyLog from '../models/DailyLog.js';
import TowerEvent from '../models/TowerEvent.js';
import Project from '../models/Project.js';

const dayKey = (d) => {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(
    dt.getDate()
  ).padStart(2, '0')}`;
};

const addDays = (date, n) => {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
};

// Builds the full dashboard payload for one project: KPIs, map towers,
// daily activity, prediction box and the cumulative communication chart.
export async function buildDashboard(projectId) {
  const project = await Project.findById(projectId).lean();
  if (!project) return null;

  const towers = await Tower.find({ project: projectId }).lean();
  towers.sort((a, b) => {
    const na = parseInt(a.number, 10);
    const nb = parseInt(b.number, 10);
    if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
    return String(a.number).localeCompare(String(b.number), undefined, { numeric: true });
  });

  // Towers dropped by a later KML revision, or manually excluded by an admin
  // (a KML point that isn't actually a tower — a junction, substation, etc.),
  // keep their history but must not count toward progress. `inKml !== false`
  // (rather than `=== true`) so docs predating the field are still active.
  const activeTowers = towers.filter((t) => t.inKml !== false && !t.excluded);

  // project.totalTowers is a snapshot of the raw KML point count at the last
  // upload/sync, which includes any manually-excluded point — subtract those
  // so "Total Towers" reflects real towers, not raw KML placemarks.
  const excludedCount = towers.filter((t) => t.inKml !== false && t.excluded).length;
  const total = (project.totalTowers || activeTowers.length) - excludedCount;
  const captured = activeTowers.filter((t) => t.captured);
  const uploaded = activeTowers.filter((t) => t.uploaded);

  const capturedDone = captured.length;
  const uploadedDone = uploaded.length;

  const pct = (done) => (total > 0 ? Math.round((done / total) * 1000) / 10 : 0);

  // ---- Acquisition KPI (latest start / latest end) ----
  const latestStart = await DailyLog.findOne({ project: projectId, type: 'start' })
    .sort({ date: -1 })
    .lean();
  const latestEnd = await DailyLog.findOne({ project: projectId, type: 'end' })
    .sort({ date: -1 })
    .lean();

  // ---- Tower issues (issueReplace with a note) ----
  // `number` is a String, so a Mongo sort would order it lexicographically
  // ("10" before "2"). Sort numerically here instead.
  const issueTowers = await Tower.find({ project: projectId, issueReplace: true, inKml: { $ne: false }, notes: { $exists: true, $ne: '' } })
    .populate('capturedBy', 'name')
    .lean();
  issueTowers.sort((a, b) => {
    const na = parseInt(a.number, 10);
    const nb = parseInt(b.number, 10);
    if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
    return String(a.number).localeCompare(String(b.number), undefined, { numeric: true });
  });

  const towerIssues = issueTowers.map((t) => ({
    number: t.number,
    note: t.notes,
    pilotName: t.capturedBy?.name || '',
    updatedAt: t.updatedAt,
  }));

  // ---- Non-working days ----
  const nonWorkingLogs = await DailyLog.find({ project: projectId, type: 'nonworking' })
    .populate('pilot', 'name')
    .sort({ date: -1 })
    .lean();

  const nonWorkingDays = nonWorkingLogs.map((l) => ({
    date: l.date,
    pilotName: l.pilot?.name || 'Unknown',
    note: l.note || '',
  }));

  // ---- Daily activity (capture / upload per day, with tower range) ----
  // Dates come from the immutable event log so a later save can't re-date
  // earlier work. Towers completed before the event log existed fall back to
  // their Tower.capturedAt/uploadedAt stamp.
  const events = await TowerEvent.find({ project: projectId, effect: 'done' })
    .sort({ date: 1 })
    .select('number action date')
    .lean();
  const lastDone = { capture: new Map(), upload: new Map() };
  events.forEach((e) => { lastDone[e.action].set(e.number, e.date); });

  // ---- Reverted work (already-done towers later un-marked, with reason) ----
  const revertLogs = await TowerEvent.find({ project: projectId, effect: 'revert' })
    .populate('pilot', 'name')
    .sort({ date: -1, createdAt: -1 })
    .lean();

  const reverts = revertLogs.map((e) => ({
    number: e.number,
    action: e.action,
    date: e.date,
    note: e.note || '',
    pilotName: e.pilot?.name || '',
  }));

  const dailyMap = new Map();
  const bump = (dateVal, field, towerNum) => {
    if (!dateVal) return;
    const k = dayKey(dateVal);
    if (!dailyMap.has(k)) {
      dailyMap.set(k, { date: k, captured: 0, uploaded: 0, capturedNumbers: [], uploadedNumbers: [], nonWorking: false });
    }
    const entry = dailyMap.get(k);
    entry[field] += 1;
    const n = parseInt(towerNum, 10);
    if (!isNaN(n)) entry[`${field}Numbers`].push(n);
  };
  const captureDate = (t) => lastDone.capture.get(t.number) || t.capturedAt;
  const uploadDate = (t) => lastDone.upload.get(t.number) || t.uploadedAt;
  captured.forEach((t) => bump(captureDate(t), 'captured', t.number));
  uploaded.forEach((t) => bump(uploadDate(t), 'uploaded', t.number));

  // Merge non-working days into the activity map (0 towers, labelled by date)
  nonWorkingLogs.forEach((l) => {
    const k = dayKey(l.date);
    if (!dailyMap.has(k)) {
      dailyMap.set(k, { date: k, captured: 0, uploaded: 0, capturedNumbers: [], uploadedNumbers: [], nonWorking: true, nonWorkingNote: l.note || '' });
    } else {
      dailyMap.get(k).nonWorking = true;
    }
  });

  const fmtShort = (dateStr) => {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  };

  // "3,4,6,7,8" -> "3-4, 6-8" — groups consecutive tower numbers so the
  // tooltip shows the real towers instead of a min-max span that swallows
  // gaps (e.g. captured 2 & 5 on the same day used to render as "Towers 2-5",
  // implying 3 and 4 were done too).
  const compactRanges = (nums) => {
    const sorted = [...new Set(nums)].sort((a, b) => a - b);
    if (!sorted.length) return '';
    const parts = [];
    let start = sorted[0];
    let prev = sorted[0];
    for (let i = 1; i < sorted.length; i += 1) {
      const n = sorted[i];
      if (n === prev + 1) { prev = n; continue; }
      parts.push(start === prev ? `${start}` : `${start}-${prev}`);
      start = n; prev = n;
    }
    parts.push(start === prev ? `${start}` : `${start}-${prev}`);
    return parts.join(', ');
  };

  const dailyActivity = [...dailyMap.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => {
      const merged = [...d.capturedNumbers, ...d.uploadedNumbers];
      const min = merged.length ? Math.min(...merged) : null;
      const max = merged.length ? Math.max(...merged) : null;
      return {
        ...d,
        towerLabel: d.nonWorking
          ? `Off ${fmtShort(d.date)}`
          : min != null
            ? min === max ? `T${min}` : `T${min}–T${max}`
            : d.date,
        capturedTowerLabel: compactRanges(d.capturedNumbers),
        uploadedTowerLabel: compactRanges(d.uploadedNumbers),
      };
    });

  // ---- Cumulative communication chart (capture solid vs upload dashed) ----
  let cumCap = 0;
  let cumUp = 0;
  const communication = dailyActivity.map((d) => {
    cumCap += d.captured;
    cumUp += d.uploaded;
    return { date: d.date, towerLabel: d.towerLabel, capture: cumCap, upload: cumUp };
  });

  // ---- Prediction box ----
  const captureDays = new Set(captured.map((t) => dayKey(captureDate(t)))).size;
  const uploadDays = new Set(uploaded.map((t) => dayKey(uploadDate(t)))).size;
  const dailyCaptureAvg = captureDays ? Math.round((capturedDone / captureDays) * 10) / 10 : 0;
  const dailyUploadAvg = uploadDays ? Math.round((uploadedDone / uploadDays) * 10) / 10 : 0;

  const remainingCapture = Math.max(total - capturedDone, 0);
  const remainingUpload = Math.max(total - uploadedDone, 0);
  const remainingCaptureDays = dailyCaptureAvg ? Math.ceil(remainingCapture / dailyCaptureAvg) : null;
  const remainingUploadDays = dailyUploadAvg ? Math.ceil(remainingUpload / dailyUploadAvg) : null;

  const prediction = {
    dailyCaptureAvg,
    dailyUploadAvg,
    remainingCapture,
    remainingUpload,
    remainingCaptureDays,
    remainingUploadDays,
    // "Tentative" completion dates projected from the running averages.
    tentativeCaptureDate: remainingCaptureDays != null ? addDays(new Date(), remainingCaptureDays) : null,
    tentativeUploadDate: remainingUploadDays != null ? addDays(new Date(), remainingUploadDays) : null,
  };

  return {
    project: {
      id: project._id,
      name: project.name,
      totalTowers: total,
      kml: project.kml || '',
      route: project.route || [],
      startDate: project.startDate || null,
    },
    kpi: {
      totalTower: total,
      capture: { done: capturedDone, pending: total - capturedDone, pct: pct(capturedDone) },
      upload: { done: uploadedDone, pending: total - uploadedDone, pct: pct(uploadedDone) },
      acquisition: {
        start: latestStart
          ? { date: latestStart.date, towerNo: latestStart.towerNo }
          : null,
        close: latestEnd ? { date: latestEnd.date, towerNo: latestEnd.towerNo } : null,
      },
    },
    towers: towers.map((t) => {
      const stale = t.inKml === false;
      const excluded = !!t.excluded;
      return {
        id: t._id,
        number: t.number,
        lat: t.lat,
        lng: t.lng,
        captured: t.captured,
        uploaded: t.uploaded,
        issueReplace: t.issueReplace,
        // Towers no longer on the line, or manually excluded by an admin as
        // not a real tower, render grey rather than disappearing, so neither
        // case looks like data went missing.
        stale: stale || excluded,
        excluded,
        status: stale || excluded ? 'grey' : t.captured && t.uploaded ? 'green' : t.captured ? 'yellow' : 'red',
      };
    }),
    dailyActivity,
    communication,
    prediction,
    nonWorkingDays,
    towerIssues,
    reverts,
  };
}
