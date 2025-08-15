const { Schema, model } = require('mongoose');

const orderItemSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  title: String,
  sku: String,
  qty: { type: Number, min: 1, required: true },
  unitPrice: { type: Number, min: 0, required: true },
  image: String
}, { _id: false });

const addressSchema = new Schema({
  firstName: String, lastName: String,
  line1: String, line2: String,
  city: String, province: String,
  postalCode: String, country: String, phone: String
}, { _id: false });

const orderSchema = new Schema({
  orderNo: { type: String, index: true }, // e.g., ORD-...
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer', default: null },
  customerEmail: String,
  items: [orderItemSchema],
  subtotal: { type: Number, min: 0, required: true },
  shipping: { type: Number, min: 0, default: 0 },
  tax: { type: Number, min: 0, default: 0 },
  grandTotal: { type: Number, min: 0, required: true },
  shippingAddress: addressSchema,
  status: { type: String, enum: ['New','Paid','Processing','Shipped','Delivered','Cancelled','Refunded'], default: 'New' },
  paymentMethod: { type: String, default: 'Mock' },
  paymentStatus: { type: String, enum: ['Pending','Paid','Refunded'], default: 'Pending' },
  tracking: { number: String, carrier: String },
timeline: [{ at: { type: Date, default: Date.now }, status: String, note: String }],

  notes: String
}, { timestamps: true });

module.exports = model('Order', orderSchema);
