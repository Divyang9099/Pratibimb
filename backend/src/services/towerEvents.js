const ACTIONS = [
  { action: 'capture', field: 'dataCapture', prevField: 'captured', noteField: 'captureRevertNote' },
  { action: 'upload', field: 'dataUpload', prevField: 'uploaded', noteField: 'uploadRevertNote' },
];

// Un-marking work that was already completed is destructive and easy to do by
// a stray click on an overlapping range, so it always has to carry a reason.
export function collectReverts(rows, prevMap) {
  const missingReason = [];
  rows.forEach((row) => {
    const prev = prevMap.get(String(row.number));
    if (!prev) return;
    ACTIONS.forEach(({ field, prevField, noteField }) => {
      if (prev[prevField] && !row[field] && !String(row[noteField] || '').trim()) {
        missingReason.push(String(row.number));
      }
    });
  });
  return { missingReason: [...new Set(missingReason)] };
}

// One immutable event per real state change. Re-saving a row that is already
// in the same state produces nothing, so overlapping daily ranges don't
// inflate the history.
export function towerEventsFor(row, prev, { projectId, when, pilot }) {
  const events = [];
  ACTIONS.forEach(({ action, field, prevField, noteField }) => {
    const next = !!row[field];
    const before = !!prev?.[prevField];
    if (next === before) return;
    events.push({
      project: projectId,
      number: String(row.number),
      pilot,
      action,
      effect: next ? 'done' : 'revert',
      date: when,
      note: next ? '' : String(row[noteField] || '').trim(),
    });
  });
  return events;
}
