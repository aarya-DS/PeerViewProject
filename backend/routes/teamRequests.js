const express = require('express');
const TeamRequest = require('../models/TeamRequest');
const auth = require('../middleware/auth');
const router = express.Router();

// Send Request
router.post('/', auth, async (req, res) => {
  try {
    const { receiverId, projectId, message } = req.body;
    const request = new TeamRequest({ sender: req.userId, receiver: receiverId, projectId, message });
    await request.save();
    await TeamRequest.populate(request, [{ path: 'sender', select: 'username' }]);
    res.json(request);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// Get My Requests
router.get('/my', auth, async (req, res) => {
  try {
    const sent = await TeamRequest.find({ sender: req.userId }).populate('receiver', 'username');
    const received = await TeamRequest.find({ receiver: req.userId }).populate('sender', 'username');
    res.json({ sent, received });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;