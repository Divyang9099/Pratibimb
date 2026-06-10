import mongoose from 'mongoose';
import crypto from 'crypto';

// A client is the customer who owns one or more inspection projects.
// They access the client dashboard with an access key (no password).
const clientSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    contactEmail: { type: String, trim: true, lowercase: true },
    contactPhone: { type: String, trim: true },
    // Key handed to the client by the admin; entered on the client page.
    accessKey: { type: String, required: true, unique: true, index: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Generate a short, human-shareable key like "TWR-9F3A2C7B".
clientSchema.statics.generateKey = function generateKey() {
  return 'TWR-' + crypto.randomBytes(4).toString('hex').toUpperCase();
};

export default mongoose.model('Client', clientSchema);
