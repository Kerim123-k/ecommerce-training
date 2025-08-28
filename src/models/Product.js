// src/models/Product.js
const { Schema, model } = require('mongoose');
const slugify = require('slugify');

const productSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    sku:   { type: String, required: true, unique: true, uppercase: true },
    slug:  { type: String, required: true, unique: true, lowercase: true },
    status:{ type: String, enum: ['Draft','Active'], default: 'Draft' },
    price: { type: Number, required: true, min: 0 },
    stockQty: { type: Number, required: true, min: 0 },
    categories: [{ type: Schema.Types.ObjectId, ref: 'Category', index: true }],
    images: [String],
    description: String,
    tags: [String],
    brand: String,
    taxable: { type: Boolean, default: true },
    trackInventory: { type: Boolean, default: true },
    ratingAvg:   { type: Number, default: 0 },
ratingCount: { type: Number, default: 0 },

    isDeleted: { type: Boolean, default: false }
  },
  { timestamps: true }
);

// Auto-slug if missing
productSchema.pre('validate', function (next) {
  if (!this.slug && this.title) {
    this.slug = slugify(this.title, { lower: true, strict: true });
  }
  next();
});

productSchema.query.notDeleted = function () {
  return this.where({ isDeleted: { $ne: true } });
};



module.exports = model('Product', productSchema);
