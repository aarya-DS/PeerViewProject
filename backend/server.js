const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const reviewRoutes = require('./routes/reviews');
const teamRequestRoutes = require('./routes/teamRequests');
const { scoreProject, extractTextFromFile } = require('./utils/scorer'); // For auto-scoring

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// EJS Setup
app.set('view engine', 'ejs');
app.set('views', './views');

// Session Setup (for remembering login in EJS tests)
app.use(session({
  secret: process.env.JWT_SECRET || 'fallback_secret',
  resave: false,
  saveUninitialized: true
}));

// Multer Setup (file upload config)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads')); // Serve uploaded files
app.use(express.static('public')); // Serve custom CSS/JS

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected successfully'))
  .catch(err => console.log('MongoDB connection error:', err));

// API Routes (unchanged—for Angular later)
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/teamrequests', teamRequestRoutes);

// EJS Test Routes
app.get('/signup', (req, res) => res.render('signup', { user: null }));

app.post('/signup', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const User = require('./models/User');
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.render('error', { msg: `User ${email} exists!`, user: null });

    const bcrypt = require('bcryptjs');
    const hashedPw = await bcrypt.hash(password, 12);
    const newUser = new User({ username, email, password: hashedPw });
    await newUser.save();

    req.session.userId = newUser._id; // Auto-login
    req.session.username = username;
    res.render('success', { msg: 'Signup Success!', user: username, detail: `ID: ${newUser._id}` });
  } catch (err) {
    res.render('error', { msg: err.message, user: null });
  }
});

app.get('/login', (req, res) => res.render('login', { user: null }));

app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log(`Login attempt: Email=${email}`); // Debug log
    const User = require('./models/User');
    const bcrypt = require('bcryptjs');
    const user = await User.findOne({ email });
    if (!user) {
      console.log('No user found'); // Debug
      return res.render('error', { msg: 'No account with that email!', user: null });
    }
    const match = await bcrypt.compare(password, user.password);
    console.log(`Password match: ${match}`); // Debug
    if (!match) {
      console.log('Password mismatch'); // Debug
      return res.render('error', { msg: 'Wrong password!', user: null });
    }

    req.session.userId = user._id;
    req.session.username = user.username;
    console.log('Login success!'); // Debug
    res.render('success', { msg: 'Login Success!', user: user.username, detail: `ID: ${user._id}` });
  } catch (err) {
    console.log(`Login error: ${err.message}`); // Debug
    res.render('error', { msg: err.message, user: null });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// Project Creation with File Upload & Auto-Scoring
app.get('/create-project', (req, res) => {
  if (!req.session.userId) return res.redirect('/login');
  res.render('create-project', { user: req.session.username });
});

app.post('/create-project', upload.single('projectFile'), async (req, res) => {
  try {
    if (!req.session.userId) return res.redirect('/login');
    const { title, description, tags } = req.body;
    const Project = require('./models/Project');
    const fileUrl = req.file ? `/uploads/${req.file.filename}` : null;

    // Temp save project
    const newProject = new Project({ 
      title, 
      description, 
      owner: req.session.userId, 
      fileUrl,
      tags: tags ? tags.split(',').map(t => t.trim()) : [] 
    });
    await newProject.save();

    // Scoring Analysis
    let analysisText = description;
    if (fileUrl && req.file) {
      const fullPath = path.join(__dirname, fileUrl);
      const fileText = await extractTextFromFile(fullPath); // Await async extraction
      if (fileText) analysisText += `\n\nFile Content: ${fileText}`;
    }

    const scoreResult = scoreProject(analysisText);
    // Update project with scores/feedback
    await Project.findByIdAndUpdate(newProject._id, {
      clarityScore: scoreResult.clarityScore,
      creativityScore: scoreResult.creativityScore,
      technicalityScore: scoreResult.technicalityScore,
      overallScore: scoreResult.overallScore,
      feedback: scoreResult.feedback
    });

    res.render('success', { 
      msg: 'Project Created & Analyzed!', 
      user: req.session.username, 
      detail: `${title} | Overall Score: ${scoreResult.overallScore}/5\nFeedback: ${scoreResult.feedback}` 
    });
  } catch (err) {
    console.error('Upload Error:', err);
    res.render('error', { msg: err.message, user: req.session.username });
  }
});

// View Projects
app.get('/projects', async (req, res) => {
  try {
    const Project = require('./models/Project');
    const projects = await Project.find().populate('owner', 'username');
    res.render('projects', { user: req.session.username, projects });
  } catch (err) {
    res.render('error', { msg: err.message, user: req.session.username });
  }
});

// Review with Auth
app.get('/review/:id', async (req, res) => {
  if (!req.session.userId) return res.redirect('/login');
  try {
    const Review = require('./models/Review');
    const Project = require('./models/Project');
    const project = await Project.findById(req.params.id).populate('owner', 'username');
    const reviews = await Review.find({ project: req.params.id }).populate('reviewer', 'username');
    console.log('Review Page - Project:', project ? project.title : 'Not found'); // Debug: Log project
    console.log('Review Page - Owner:', project ? project.owner : 'Null owner'); // Debug: Log owner
    console.log('Review Page - Reviews Count:', reviews.length); // Debug: Log reviews
    res.render('review', { user: req.session.username, project, reviews });
  } catch (err) {
    console.error('Review Error:', err.message); // Debug: Log error
    res.render('error', { msg: err.message, user: req.session.username });
  }
});

app.post('/submit-review', async (req, res) => {
  try {
    if (!req.session.userId) return res.redirect('/login');
    const { project, clarity, creativity, technicality, comment } = req.body;
    const Review = require('./models/Review');
    const newReview = new Review({ 
      project, 
      reviewer: req.session.userId, 
      clarity: parseInt(clarity), 
      creativity: parseInt(creativity), 
      technicality: parseInt(technicality), 
      comment 
    });
    await newReview.save();
    res.render('success', { msg: 'Review Submitted!', user: req.session.username });
  } catch (err) {
    res.render('error', { msg: err.message, user: req.session.username });
  }
});

app.get('/', (req, res) => {
  res.render('home', { user: req.session.username });
});

// Error/Success Templates (render)
app.get('/error', (req, res) => res.render('error', { user: req.session.username }));
app.get('/success', (req, res) => res.render('success', { user: req.session.username }));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});