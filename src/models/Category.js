// src/models/Category.js
const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const categorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    status: { type: String, enum: ['Active', 'Hidden'], default: 'Active' },
    parentId: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    description: String,
    image: String,
  },
  { timestamps: true }
);

/* ---------- schema-level brakes to block unsafe deletes ---------- */
async function assertNotInUse(id, next) {
  try {
    const Product = mongoose.model('Product');
    const exists = await Product.exists({
      categories: id,
      isDeleted: { $ne: true },
    });
    if (exists) return next(new Error('CategoryInUse: products still reference this category'));
    next();
  } catch (err) {
    next(err);
  }
}

// findByIdAndDelete -> triggers this
categorySchema.pre('findOneAndDelete', async function (next) {
  const id = this.getQuery()._id;
  if (!id) return next();
  await assertNotInUse(id, next);
});

// Model.deleteOne({ _id }) -> triggers this
categorySchema.pre('deleteOne', { query: true, document: false }, async function (next) {
  const id = this.getQuery()._id;
  if (!id) return next();
  await assertNotInUse(id, next);
});

// doc.deleteOne()
categorySchema.pre('deleteOne', { document: true, query: false }, async function (next) {
  await assertNotInUse(this._id, next);
});

// doc.remove() (older API)
categorySchema.pre('remove', async function (next) {
  await assertNotInUse(this._id, next);
});
/* ---------------------------------------------------------------- */

module.exports = model('Category', categorySchema);
