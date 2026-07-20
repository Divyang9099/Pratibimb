import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

// Admin & Pilot accounts. Both log in with loginId + password.
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    loginId: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    // Plaintext copy kept so an admin can view/share a pilot's current
    // credentials. The bcrypt hash above is still what login verifies against.
    plainPassword: { type: String },
    role: { type: String, enum: ['admin', 'pilot'], required: true },
    phone: { type: String, trim: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

userSchema.methods.setPassword = async function setPassword(plain) {
  this.passwordHash = await bcrypt.hash(plain, 10);
  this.plainPassword = plain;
};

userSchema.methods.verifyPassword = function verifyPassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id,
    name: this.name,
    loginId: this.loginId,
    role: this.role,
    phone: this.phone,
    active: this.active,
  };
};

export default mongoose.model('User', userSchema);
