import mongoose from 'mongoose';

// Immutable per-day record of a tower being marked captured/uploaded, or of
// that being reversed. Tower.capturedAt/uploadedAt is a single mutable field
// and cannot hold a history, so the dashboard's day-by-day charts are built
// from these events instead.
const towerEventSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    number: { type: String, required: true },
    pilot: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    action: { type: String, enum: ['capture', 'upload'], required: true },
    // 'done' = marked complete, 'revert' = un-marked (always carries a reason).
    effect: { type: String, enum: ['done', 'revert'], required: true },
    date: { type: Date, required: true },
    note: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

towerEventSchema.index({ project: 1, number: 1, action: 1, date: -1 });

export default mongoose.model('TowerEvent', towerEventSchema);
