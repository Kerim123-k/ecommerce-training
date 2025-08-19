const { Schema, model } = require('mongoose');

const addressSchema = new Schema({
  fullName:   { type: String, required: true, trim: true },
  phone:      { type: String, required: true, trim: true },
  line1:      { type: String, required: true, trim: true },
  line2:      { type: String, trim: true },
  city:       { type: String, required: true, trim: true },
  postalCode: { type: String, required: true, trim: true },
  country:    { type: String, required: true, trim: true, default: 'TR' },

  isDefault:  { type: Boolean, default: false },
  role: { type: String, enum: ['customer','admin'], default: 'customer' }
}, { _id: true, timestamps: true },
  

);

const customerSchema = new Schema({
  email: { type: String, unique: true, required: true, trim: true, lowercase: true },
  passwordHash: String,
  name: String,
  phone: String,
  status: { type: String, enum: ['Active','Suspended'], default: 'Active' },

  addresses: [addressSchema],

  resetTokenHash: String,
  resetTokenExpires: Date,
}, { timestamps: true });

/** Ensure only one default; if none, first address becomes default */
customerSchema.pre('save', function(next) {
  if (!this.isModified('addresses')) return next();
  let sawDefault = false;
  this.addresses = (this.addresses || []).map(a => {
    const obj = a.toObject?.() ?? a;
    if (obj.isDefault && !sawDefault) { sawDefault = true; return obj; }
    return { ...obj, isDefault: false };
  });
  if (!sawDefault && this.addresses.length > 0) {
    this.addresses[0].isDefault = true;
  }
  next();
});

customerSchema.methods.setDefaultAddress = function(addrId) {
  this.addresses.forEach(a => { a.isDefault = String(a._id) === String(addrId); });
  return this.save();
};

module.exports = model('Customer', customerSchema);
