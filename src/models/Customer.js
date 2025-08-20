// src/models/Customer.js
const mongoose = require('mongoose');   // 👈 add this

const AddressSchema = new mongoose.Schema({
  fullName:   { type: String, trim: true },     // 👈 new field we read in the views
  label:      { type: String, trim: true },
  firstName:  { type: String, trim: true },
  lastName:   { type: String, trim: true },
  line1:      { type: String, required: true },
  line2:      { type: String, default: '' },
  city:       { type: String, required: true },
  province:   { type: String, default: '' },
  postalCode: { type: String, default: '' },
  country:    { type: String, default: 'TR' },
  phone:      { type: String, default: '' },
  isDefault:  { type: Boolean, default: false },
}, { _id: true });

const CustomerSchema = new mongoose.Schema({
  email:            { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash:     { type: String, required: true },
  firstName:        { type: String, default: '' },
  lastName:         { type: String, default: '' },
  role:             { type: String, enum: ['User', 'Admin'], default: 'User' },
  status:           { type: String, enum: ['Active', 'Suspended'], default: 'Active' },
  addresses:        { type: [AddressSchema], default: [] },
  resetTokenHash:   String,
  resetTokenExpires: Date,
}, { timestamps: true });

module.exports = mongoose.model('Customer', CustomerSchema);
