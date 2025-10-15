const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  reviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  clarity: { type: Number, min: 1, max: 5, required: true },
  creativity: { type: Number, min: 1, max: 5, required: true },
  technicality: { type: Number, min: 1, max: 5, required: true },
  comment: { type: String, required: true },
  averageRating: { type: Number, min: 1, max: 5 }, // Auto-calculated
  createdAt: { type: Date, default: Date.now }
});

// Calculate average before saving
reviewSchema.pre('save', function(next) {
  this.averageRating = (this.clarity + this.creativity + this.technicality) / 3;
  next();
});

module.exports = mongoose.model('Review', reviewSchema);