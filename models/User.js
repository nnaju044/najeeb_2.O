'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email address'],
    },
    name: { type: String, trim: true, maxlength: 80, default: '' },
    passwordHash: { type: String, required: true, select: false },
    timezone: { type: String, default: 'Asia/Kolkata' },
    theme: { type: String, enum: ['dark', 'light'], default: 'dark' },
    prayerTrackerEnabled: { type: Boolean, default: false },
  },
  { timestamps: true }
);

userSchema.statics.hashPassword = function hashPassword(password) {
  return bcrypt.hash(password, 12);
};

userSchema.methods.verifyPassword = function verifyPassword(password) {
  if (!this.passwordHash) return Promise.resolve(false);
  return bcrypt.compare(password, this.passwordHash);
};

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id.toString(),
    email: this.email,
    name: this.name,
    theme: this.theme,
    prayerTrackerEnabled: Boolean(this.prayerTrackerEnabled),
  };
};

userSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
