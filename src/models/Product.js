const { Schema, model } = require('mongoose');

const productSchema = new Schema({
  title: { type: String, required: true, trim: true },
  sku:   { type: String, required: true, unique: true, uppercase: true },
  slug:  { type: String, required: true, unique: true, lowercase: true },
  status:{ type: String, enum: ['Draft','Active'], default: 'Draft' },
  price: { type: Number, required: true, min: 0 },
  stockQty: { type: Number, required: true, min: 0 },
  categories: [{ type: Schema.Types.ObjectId, ref: 'Category' }],
  images: [String],
  description: String,
  tags: [String],
  brand: String,
  taxable: { type: Boolean, default: true },
  trackInventory: { type: Boolean, default: true },

isDeleted: { type: Boolean, default: false }
},{ timestamps: true });

module.exports = model('Product', productSchema);
// add required 