import mongoose from 'mongoose';

// One powerline inspection project belonging to a client.
const projectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
    totalTowers: { type: Number, required: true, default: 0 },
    // Raw KML XML string for the powerline route shown on the map.
    kml: { type: String, default: '' },
    // Parsed powerline route as [[lat, lng], …] (extracted from the KML).
    route: { type: [[Number]], default: [] },
    description: { type: String, trim: true },
    startDate: { type: Date },
    active: { type: Boolean, default: true },
    // Whether pilots must attach a field photo on Start/End Day for this project.
    requirePhoto: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model('Project', projectSchema);
