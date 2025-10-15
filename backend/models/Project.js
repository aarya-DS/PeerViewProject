const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  fileUrl: { type: String },
  tags: [String],
  originalFilename: String,
  // New: Rule-Based Scoring
  clarityScore: { type: Number, min: 1, max: 5 },
  creativityScore: { type: Number, min: 1, max: 5 },
  technicalityScore: { type: Number, min: 1, max: 5 },
  overallScore: { type: Number, min: 1, max: 5 },
  feedback: { type: String }, // Suggestions string
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Project', projectSchema);