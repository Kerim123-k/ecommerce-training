const { Schema, model } = require('mongoose');

const categorySchema = new Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true },
  status: { type: String, enum: ['Active','Hidden'], default: 'Active' },
  parentId: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
  description: String,
  image: String
}, { timestamps: true });

module.exports = model('Category', categorySchema);
// add required fileds