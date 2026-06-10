import Tower from '../models/Tower.js';
import DailyLog from '../models/DailyLog.js';
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

  const towers = await Tower.find({ project: projectId }).sort({ number: 1 }).lean();

  const total = project.totalTowers || towers.length;
  const captured = towers.filter((t) => t.captured);
  const uploaded = towers.filter((t) => t.uploaded);

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

  // ---- Daily activity (capture / upload per day, with tower range) ----
  const dailyMap = new Map();
  const bump = (dateVal, field, towerNum) => {
    if (!dateVal) return;
    const k = dayKey(dateVal);
    if (!dailyMap.has(k)) dailyMap.set(k, { date: k, captured: 0, uploaded: 0, towerMin: Infinity, towerMax: -Infinity });
    const entry = dailyMap.get(k);
    entry[field] += 1;
    const n = parseInt(towerNum, 10);
    if (!isNaN(n)) {
      if (n < entry.towerMin) entry.towerMin = n;
      if (n > entry.towerMax) entry.towerMax = n;
    }
  };
  captured.forEach((t) => bump(t.capturedAt, 'captured', t.number));
  uploaded.forEach((t) => bump(t.uploadedAt, 'uploaded', t.number));

  const dailyActivity = [...dailyMap.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({
      ...d,
      // Human-readable label: tower range worked that day, e.g. "T5–T25"
      towerLabel: d.towerMin !== Infinity
        ? d.towerMin === d.towerMax ? `T${d.towerMin}` : `T${d.towerMin}–T${d.towerMax}`
        : d.date,
    }));

  // ---- Cumulative communication chart (capture solid vs upload dashed) ----
  let cumCap = 0;
  let cumUp = 0;
  const communication = dailyActivity.map((d) => {
    cumCap += d.captured;
    cumUp += d.uploaded;
    return { date: d.date, towerLabel: d.towerLabel, capture: cumCap, upload: cumUp };
  });

  // ---- Prediction box ----
  const captureDays = new Set(captured.map((t) => dayKey(t.capturedAt))).size;
  const uploadDays = new Set(uploaded.map((t) => dayKey(t.uploadedAt))).size;
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
    towers: towers.map((t) => ({
      id: t._id,
      number: t.number,
      lat: t.lat,
      lng: t.lng,
      captured: t.captured,
      uploaded: t.uploaded,
      issueReplace: t.issueReplace,
      status: t.captured && t.uploaded ? 'green' : t.captured ? 'yellow' : 'red',
    })),
    dailyActivity,
    communication,
    prediction,
  };
}
