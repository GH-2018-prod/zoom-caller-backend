const mongoose = require('mongoose');

const linkSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      uppercase: true, // asegura A1 en vez de a1
      trim: true
    },
    url: {
      type: String,
      required: true,
    },
    title: {
      type: String, // opcional (ej: "Math Class")
    },
    active: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Link', linkSchema);