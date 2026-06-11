import mongoose from 'mongoose';

const dailyLogSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    pilot: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // 'nonworking' entries need no towerNo or image — just date + optional note.
    type: { type: String, enum: ['start', 'end', 'nonworking'], required: true },
    date: { type: Date, required: true },
    towerNo: { type: String, default: '' },
    image: { type: String, default: '' },
    note: { type: String, trim: true },
  },
  { timestamps: true }
);

export default mongoose.model('DailyLog', dailyLogSchema);
