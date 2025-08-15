const { Schema, model } = require('mongoose');

const addressSchema = new Schema({
  label: String,
  firstName: String,
  lastName: String,
  line1: { type: String, required: true },
  line2: String,
  city: String,
  province: String,
  postalCode: String,
  country: { type: String, default: 'TR' },
  phone: String,
  isDefault: { type: Boolean, default: false }
}, { _id: false });

const customerSchema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  firstName: String,
  lastName: String,
  phone: String,
  addresses: [addressSchema],
  status: { type: String, enum: ['Active','Suspended'], default: 'Active' },

  // ↓↓↓ added for password reset flow ↓↓↓
  resetTokenHash: String,
  resetTokenExpires: Date
}, { timestamps: true });

module.exports = model('Customer', customerSchema);
