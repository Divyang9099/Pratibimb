import mongoose from 'mongoose';
import Tower from '../models/Tower.js';

const ACTIONS = [
  { action: 'capture', field: 'dataCapture', prevField: 'captured', noteField: 'captureRevertNote' },
  { action: 'upload', field: 'dataUpload', prevField: 'uploaded', noteField: 'uploadRevertNote' },
];

// Lowest/highest tower number actually on each project's current KML route
// (excludes towers a later re-sync dropped, and admin-excluded points). Lets
// the pilot's tower-range picker reject a range like "1-1000" instead of
// silently spawning phantom Tower docs for numbers nobody surveyed, and
// tells the pilot the real range so they don't have to guess it.
export async function activeTowerRanges(projectIds) {
  const ranges = await Tower.aggregate([
    {
      $match: {
        project: { $in: projectIds.map((id) => new mongoose.Types.ObjectId(id)) },
        inKml: { $ne: false },
        excluded: { $ne: true },
      },
    },
    { $addFields: { numVal: { $convert: { input: '$number', to: 'int', onError: null, onNull: null } } } },
    { $match: { numVal: { $ne: null } } },
    { $group: { _id: '$project', min: { $min: '$numVal' }, max: { $max: '$numVal' } } },
  ]);
  return new Map(ranges.map((r) => [String(r._id), { min: r.min, max: r.max }]));
}

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
