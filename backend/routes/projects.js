const express = require('express');
const Project = require('../models/Project');
const auth = require('../middleware/auth'); // We'll create this next
const router = express.Router();

// Create Project (protected)
router.post('/', auth, async (req, res) => {
  try {
    const project = new Project({ ...req.body, owner: req.userId });
    await project.save();
    res.json(project);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// Get All Projects
router.get('/', async (req, res) => {
  try {
    const projects = await Project.find().populate('owner', 'username');
    res.json(projects);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// Get Single Project
router.get('/:id', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id).populate('owner', 'username');
    if (!project) return res.status(404).json({ msg: 'Project not found' });
    res.json(project);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;