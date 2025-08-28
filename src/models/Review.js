// src/models/Review.js
const mongoose = require('mongoose');

const ReviewSchema = new mongoose.Schema(
  {
    productId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    customerId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    customerEmail:{ type: String, default: '' },
    customerName: { type: String, default: '' },

    rating:      { type: Number, min: 1, max: 5, required: true },
    title:       { type: String, default: '' },
    body:        { type: String, required: true },

    status:      { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending', index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Review', ReviewSchema);
