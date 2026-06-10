import mongoose from 'mongoose';

// Pilot "Acquisition Update" entries: the Start-Day (morning) and
// End-Day (evening) records used by the client's Acquisition KPI and
// for the field audit trail. Data-capture/upload progress itself is
// stored on the Tower documents (see Tower.js); this log captures the
// daily field open/close events with their reference image.
const dailyLogSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    pilot: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['start', 'end'], required: true },
    date: { type: Date, required: true },
    // Tower number where the day started / was closed.
    towerNo: { type: String, required: true },
    // Reference image captured in the field (URL or base64 data URI).
    image: { type: String, default: '' },
    note: { type: String, trim: true },
  },
  { timestamps: true }
);

export default mongoose.model('DailyLog', dailyLogSchema);
