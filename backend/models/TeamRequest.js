const mongoose = require('mongoose');

const teamRequestSchema = new mongoose.Schema({
  requester: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  collaboratorEmail: { 
    type: String, 
    required: true 
  },
  status: { 
    type: String, 
    enum: ['pending', 'accepted', 'rejected'], 
    default: 'pending' 
  },
  inviteCode: { 
    type: String, 
    required: true, 
    unique: true 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Optional: Index for faster queries on status/inviteCode
teamRequestSchema.index({ status: 1, inviteCode: 1 });

module.exports = mongoose.model('TeamRequest', teamRequestSchema);