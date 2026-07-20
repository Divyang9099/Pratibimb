// Reconciles a (re)uploaded KML against a project's existing Tower docs.
//
// The guiding rule: a KML re-upload is a GEOMETRY update, never a progress
// update. Only `lat`, `lng` and `inKml` are ever written to a Tower here.
// `captured`, `uploaded`, their timestamps/authors, `issueReplace` and
// `notes` are deliberately absent from every $set below — re-uploading the
// same line a dozen times must not lose a single day of field work.
//
// Towers are matched by `number`, which is the stable identity across KML
// revisions (the same physical tower keeps its label even if the file is
// re-exported and its coordinates shift by a few metres).

import Project from '../models/Project.js';
import Tower from '../models/Tower.js';
import { parseKml } from './kml.js';

// Coordinate deltas below this are re-export float noise, not a real move.
const MOVE_EPSILON_M = 0.5;
// A tower shifting further than this suggests the KML is a *different*
// powerline, not a new revision of the same one. Surfaced as a warning in
// the preview so the admin can catch a wrong-file upload before applying.
const LINE_MISMATCH_M = 500;

// Great-circle distance in metres between two lat/lng pairs.
function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const round = (n, dp = 1) => Math.round(n * 10 ** dp) / 10 ** dp;

// Collapse the parsed KML points to one entry per tower number, recording
// any number that appeared more than once so the preview can flag it.
function dedupeByNumber(kmlTowers) {
  const byNumber = new Map();
  const duplicates = [];
  for (const t of kmlTowers) {
    if (byNumber.has(t.number)) duplicates.push(t.number);
    else byNumber.set(t.number, t);
  }
  return { byNumber, duplicates };
}

// Compare a parsed KML against the project's towers without writing anything.
// Returns the diff that both the preview and the apply path work from.
function buildDiff(existing, kmlByNumber) {
  const added = [];
  const moved = [];
  const restored = [];
  const missing = [];
  let unchanged = 0;

  const existingByNumber = new Map(existing.map((t) => [t.number, t]));

  for (const [number, point] of kmlByNumber) {
    const current = existingByNumber.get(number);

    if (!current) {
      added.push({ number, lat: point.lat, lng: point.lng });
      continue;
    }

    // A tower that had dropped out of a previous KML and is back in this one.
    if (current.inKml === false) {
      restored.push({
        number,
        captured: !!current.captured,
        uploaded: !!current.uploaded,
      });
    }

    const hadCoords = Number.isFinite(current.lat) && Number.isFinite(current.lng);
    const meters = hadCoords
      ? haversineMeters(current.lat, current.lng, point.lat, point.lng)
      : null;

    if (meters === null) {
      // First time this tower gets geometry (e.g. auto-generated 1…N docs).
      moved.push({ number, meters: null, hasProgress: !!(current.captured || current.uploaded) });
    } else if (meters > MOVE_EPSILON_M) {
      moved.push({ number, meters: round(meters, 1), hasProgress: !!(current.captured || current.uploaded) });
    } else {
      unchanged += 1;
    }
  }

  // Towers we know about that this KML does not mention. Already-stale ones
  // are not re-reported — they were flagged by an earlier upload.
  for (const t of existing) {
    if (kmlByNumber.has(t.number) || t.inKml === false) continue;
    missing.push({
      number: t.number,
      captured: !!t.captured,
      uploaded: !!t.uploaded,
    });
  }

  return { added, moved, restored, missing, unchanged };
}

// Turn the raw diff into the summary the admin UI renders.
function summarise(diff, kmlByNumber, duplicates, existing, routePoints) {
  const distances = diff.moved.map((m) => m.meters).filter((m) => Number.isFinite(m));
  const maxMove = distances.length ? Math.max(...distances) : 0;
  const avgMove = distances.length
    ? round(distances.reduce((a, b) => a + b, 0) / distances.length, 1)
    : 0;

  const warnings = [];
  if (!kmlByNumber.size) {
    warnings.push('This KML contains no recognisable tower points. Nothing would be updated.');
  }
  if (maxMove > LINE_MISMATCH_M) {
    warnings.push(
      `Some towers move up to ${Math.round(maxMove)} m. That is a long way for a re-export of the same line — check this is the right file.`
    );
  }
  if (duplicates.length) {
    warnings.push(
      `Duplicate tower numbers in the KML (${[...new Set(duplicates)].slice(0, 10).join(', ')}) — the first point for each was used.`
    );
  }
  const missingWithProgress = diff.missing.filter((m) => m.captured || m.uploaded);
  if (missingWithProgress.length) {
    warnings.push(
      `${missingWithProgress.length} tower(s) with existing capture/upload data are not in this KML. Their data is kept but they stop counting toward progress.`
    );
  }

  const preservedProgress = existing.filter((t) => t.captured || t.uploaded).length;

  // Towers an *earlier* KML already dropped and this one does not bring back.
  // Not counted in `missing` (nothing changes for them), but worth showing:
  // otherwise "dropped: 0" reads as "nothing is excluded" when it isn't.
  const alreadyStale = existing.filter(
    (t) => t.inKml === false && !kmlByNumber.has(t.number)
  ).length;

  return {
    kmlTowers: kmlByNumber.size,
    routePoints,
    alreadyStale,
    added: diff.added.length,
    moved: diff.moved.length,
    unchanged: diff.unchanged,
    restored: diff.restored.length,
    missing: diff.missing.length,
    missingWithProgress: missingWithProgress.length,
    // Proof for the admin that no field work is touched by this operation.
    preservedProgress,
    maxMoveMeters: round(maxMove, 1),
    avgMoveMeters: avgMove,
    warnings,
    // Bounded samples so a 2000-tower KML doesn't blow up the response.
    sample: {
      added: diff.added.slice(0, 20).map((a) => a.number),
      missing: diff.missing.slice(0, 20).map((m) => m.number),
      restored: diff.restored.slice(0, 20).map((r) => r.number),
      moved: [...diff.moved]
        .sort((a, b) => (b.meters ?? 0) - (a.meters ?? 0))
        .slice(0, 20),
    },
  };
}

// Dry-run: report exactly what an apply would do. Writes nothing.
export async function previewKml(projectId, kml) {
  const project = await Project.findById(projectId).lean();
  if (!project) return null;

  const { towers: kmlTowers, route } = parseKml(kml);
  const { byNumber, duplicates } = dedupeByNumber(kmlTowers);
  const existing = await Tower.find({ project: projectId }).lean();

  const diff = buildDiff(existing, byNumber);
  const summary = summarise(diff, byNumber, duplicates, existing, route.length);

  return {
    ...summary,
    totalTowers: { from: project.totalTowers || 0, to: byNumber.size },
    currentKmlFileName: project.kmlFileName || '',
    kmlVersion: project.kmlVersion || 0,
  };
}

// Apply the KML: write geometry, flag towers that dropped out, refresh the
// project's route and tower count. Progress fields are never written.
export async function applyKmlToProject(projectId, kml, { fileName = '', userId = null } = {}) {
  const project = await Project.findById(projectId).lean();
  if (!project) return null;

  const { towers: kmlTowers, route } = parseKml(kml);
  const { byNumber, duplicates } = dedupeByNumber(kmlTowers);

  if (!byNumber.size) {
    const err = new Error('This KML contains no recognisable tower points');
    err.status = 400;
    throw err;
  }

  const existing = await Tower.find({ project: projectId }).lean();
  const diff = buildDiff(existing, byNumber);
  const summary = summarise(diff, byNumber, duplicates, existing, route.length);

  const ops = [];

  // Geometry for every tower in the new KML. Upserted so points that have
  // no Tower doc yet still land on the map, and `inKml` is re-asserted so a
  // previously-stale tower comes back with its history intact.
  for (const [number, point] of byNumber) {
    ops.push({
      updateOne: {
        filter: { project: projectId, number },
        update: { $set: { lat: point.lat, lng: point.lng, inKml: true } },
        upsert: true,
      },
    });
  }

  // Towers this KML dropped: flagged only. Coordinates and all progress
  // fields are left exactly as they were, so a future KML can restore them.
  if (diff.missing.length) {
    ops.push({
      updateMany: {
        filter: { project: projectId, number: { $in: diff.missing.map((m) => m.number) } },
        update: { $set: { inKml: false } },
      },
    });
  }

  await Tower.bulkWrite(ops);

  await Project.findByIdAndUpdate(projectId, {
    $set: {
      kml,
      route,
      totalTowers: byNumber.size,
      kmlFileName: fileName,
      kmlUpdatedAt: new Date(),
      kmlUpdatedBy: userId,
    },
    $inc: { kmlVersion: 1 },
  });

  return {
    ...summary,
    totalTowers: { from: project.totalTowers || 0, to: byNumber.size },
    kmlVersion: (project.kmlVersion || 0) + 1,
  };
}
