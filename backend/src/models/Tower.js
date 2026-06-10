import mongoose from 'mongoose';

// Per-tower inspection status. This is the source of truth for the map
// colours and the client KPIs.
//   captured && uploaded  -> GREEN  (done)
//   captured && !uploaded -> YELLOW (captured, upload pending)
//   !captured             -> RED    (pending)
const towerSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    // Tower number/label, e.g. "1", "T-12". Unique within a project.
    number: { type: String, required: true },
    // Optional geometry from KML so the map can draw/colour the segment.
    lat: { type: Number },
    lng: { type: Number },

    captured: { type: Boolean, default: false },
    capturedAt: { type: Date },
    capturedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    uploaded: { type: Boolean, default: false },
    uploadedAt: { type: Date },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    issueReplace: { type: Boolean, default: false },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

towerSchema.index({ project: 1, number: 1 }, { unique: true });

// Derived colour status used by the client map.
towerSchema.virtual('status').get(function status() {
  if (this.captured && this.uploaded) return 'green';
  if (this.captured && !this.uploaded) return 'yellow';
  return 'red';
});

towerSchema.set('toJSON', { virtuals: true });
towerSchema.set('toObject', { virtuals: true });

export default mongoose.model('Tower', towerSchema);
