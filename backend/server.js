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
const nodemailer = require('nodemailer'); // Add this line
const crypto = require('crypto'); // Add this for generateVerificationCode
dotenv.config();

// CORRECT
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: process.env.EMAIL_PORT || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Helper: Generate 6-digit code
const generateVerificationCode = () => {
  return crypto.randomInt(100000, 999999).toString();
};

// Helper: Send verification email (REAL: sends; fallback mock if .env missing)
const sendVerificationEmail = async (email, code) => {
  try {
    const mailOptions = {
      from: `"PeerView" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'PeerView: Verify Your Login',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #007bff;">Welcome to PeerView!</h2>
          <p>Your verification code is: <strong style="font-size: 24px; color: #28a745;">${code}</strong></p>
          <p>This code expires in 1 hour. Enter it on our site to complete login.</p>
          <p>If you didn't request this, ignore it.</p>
          <hr style="border: 1px solid #ddd;">
          <p style="font-size: 12px; color: #666;">&copy; 2025 PeerView</p>
        </div>
      `
    };
    await transporter.sendMail(mailOptions);
    console.log(`✅ Real email sent to ${email} with code ${code}`);
  } catch (err) {
    console.error('❌ Email send failed:', err.message);
    // Fallback mock for debugging
    console.log(`\n=== FALLBACK MOCK TO: ${email} ===`);
    console.log(`Code: ${code} (Check email setup)`);
    console.log('=====================================\n');
  }
};
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
    if (existingUser) {
      return res.render('error', { 
        msg: `User ${email} exists!`, 
        user: null, 
        detail: 'Please use a different email address.' 
      });
    }

    const bcrypt = require('bcryptjs');
    const hashedPw = await bcrypt.hash(password, 12);
    
    // Create unverified user (no code yet)
    const newUser = new User({ 
      username, 
      email, 
      password: hashedPw,
      isVerified: false
    });
    await newUser.save();

    res.render('success', { 
      msg: 'Signup Success! Account Created.', 
      user: null, 
      detail: `Welcome, ${username}! Your account is ready. <a href="/login">Login</a> to verify via email.` 
    });
  } catch (err) {
    console.error('Signup Error:', err);
    res.render('error', { 
      msg: 'Signup Failed.', 
      user: null, 
      detail: err.message || 'Please try again.' 
    });
  }
});

app.get('/login', (req, res) => res.render('login', { user: null }));

app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log(`Login attempt: Email=${email}`);
    const User = require('./models/User');
    const bcrypt = require('bcryptjs');
    const user = await User.findOne({ email });
    if (!user) {
      console.log('No user found');
      return res.render('error', { 
        msg: 'No account with that email!', 
        user: null, 
        detail: 'Check the email address and try again.' 
      });
    }
    const match = await bcrypt.compare(password, user.password);
    console.log(`Password match: ${match}`);
    if (!match) {
      console.log('Password mismatch');
      return res.render('error', { 
        msg: 'Wrong password!', 
        user: null, 
        detail: 'The password entered is incorrect.' 
      });
    }

    // If verified, login normally
    if (user.isVerified) {
      req.session.userId = user._id;
      req.session.username = user.username;
      console.log('Login success!');
      return res.render('success', { 
        msg: 'Login Success!', 
        user: user.username, 
        detail: `ID: ${user._id}` 
      });
    }

    // NEW: Unverified - Send code and redirect to verify
    console.log('User unverified - sending code');
    const verificationCode = generateVerificationCode();
    user.verificationCode = verificationCode;
    user.verificationExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();

    await sendVerificationEmail(email, verificationCode);

    // Store temp email in session
    req.session.tempUserEmail = email;

    res.redirect('/verify');
  } catch (err) {
    console.log(`Login error: ${err.message}`);
    res.render('error', { 
      msg: 'Login Failed.', 
      user: null, 
      detail: err.message 
    });
  }
});

// Verification Page (for login-time verification)
app.get('/verify', (req, res) => {
  if (!req.session.tempUserEmail) {
    return res.redirect('/login'); // No temp email? Back to login
  }
  res.render('verify', { 
    email: req.session.tempUserEmail,
    user: null 
  });
});

app.post('/verify', async (req, res) => {
  try {
    if (!req.session.tempUserEmail) {
      return res.redirect('/login');
    }
    const { code } = req.body;
    if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
      return res.render('error', { 
        msg: 'Invalid Code Format', 
        user: null, 
        detail: 'Enter a valid 6-digit code.' 
      });
    }

    const User = require('./models/User');
    const user = await User.findOne({ email: req.session.tempUserEmail });
    if (!user) {
      return res.render('error', { 
        msg: 'Session Expired', 
        user: null, 
        detail: 'Please login again.' 
      });
    }

    // Check code and expiry
    if (user.verificationCode !== code || user.verificationExpiry < new Date()) {
      return res.render('error', { 
        msg: 'Invalid or Expired Code', 
        user: null, 
        detail: 'Code is wrong or expired. <a href="/login">Login Again</a> to resend.' 
      });
    }

    // Activate user
    user.isVerified = true;
    user.verificationCode = undefined;
    user.verificationExpiry = undefined;
    await user.save();

    // Auto-login
    req.session.userId = user._id;
    req.session.username = user.username;
    delete req.session.tempUserEmail;

    res.redirect('/');
  } catch (err) {
    console.error('Verify Error:', err);
    res.render('error', { 
      msg: 'Verification Failed.', 
      user: null, 
      detail: err.message || 'Please try again.' 
    });
  }
});

// Resend code (triggered on login if needed, but can be called separately)
app.post('/resend-code', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }
  try {
    const User = require('./models/User');
    const user = await User.findOne({ email });
    if (!user || user.isVerified) {
      return res.status(400).json({ error: 'Invalid or already verified' });
    }

    const newCode = generateVerificationCode();
    user.verificationCode = newCode;
    user.verificationExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();

    await sendVerificationEmail(email, newCode);

    res.json({ success: true, message: 'Code resent!' });
  } catch (err) {
    console.error('Resend Error:', err);
    res.status(500).json({ error: 'Resend failed' });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error('Logout Error:', err);
  });
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

    if (!fileUrl) {
      // FIX: Added detail for file missing error
      return res.render('error', { msg: 'Project Creation Failed', user: req.session.username, detail: 'No file was uploaded.' });
    }

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
    res.render('error', { msg: 'Project creation failed.', user: req.session.username, detail: err.message }); // FIX: Added detail
  }
});

// View Projects
app.get('/projects', async (req, res) => {
  try {
    const Project = require('./models/Project');
    const projects = await Project.find().populate('owner', 'username');
    res.render('projects', { user: req.session.username, projects });
  } catch (err) {
    res.render('error', { msg: 'Failed to load projects.', user: req.session.username, detail: err.message }); // FIX: Added detail
  }
});

// Review with Auth
app.get('/review/:id', async (req, res) => {
  if (!req.session.userId) return res.redirect('/login');
  try {
    const Review = require('./models/Review');
    const Project = require('./models/Project');
    const project = await Project.findById(req.params.id).populate('owner', 'username');
    if (!project) {
       // FIX: Added detail for project not found
       return res.render('error', { msg: 'Project Not Found.', user: req.session.username, detail: `Project ID: ${req.params.id}` });
    }
    const reviews = await Review.find({ project: req.params.id }).populate('reviewer', 'username');
    console.log('Review Page - Project:', project ? project.title : 'Not found'); // Debug: Log project
    console.log('Review Page - Owner:', project ? project.owner : 'Null owner'); // Debug: Log owner
    console.log('Review Page - Reviews Count:', reviews.length); // Debug: Log reviews
    res.render('review', { user: req.session.username, project, reviews });
  } catch (err) {
    console.error('Review Error:', err.message); // Debug: Log error
    res.render('error', { msg: 'Failed to load review page.', user: req.session.username, detail: err.message }); // FIX: Added detail
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
    
    // FIX (Primary Request): Added the missing 'detail' variable
    res.render('success', { 
        msg: 'Review Submitted!', 
        user: req.session.username, 
        detail: 'Thank you for your feedback. Your review has been saved.' 
    }); 
  } catch (err) {
    // FIX: Added detail for review submission error
    res.render('error', { msg: 'Review Submission Failed.', user: req.session.username, detail: err.message }); 
  }
});

app.get('/', (req, res) => {
  res.render('home', { user: req.session.username });
});

// Error/Success Templates (render)
app.get('/error', (req, res) => res.render('error', { user: req.session.username, msg: 'An Error Occurred', detail: 'This is the generic error page.' })); // FIX: Added msg and detail
app.get('/success', (req, res) => res.render('success', { user: req.session.username, msg: 'Success!', detail: 'This is the generic success page.' })); // FIX: Added msg and detail

app.get('/test-email', async (req, res) => {
  await sendVerificationEmail('your-test@gmail.com', '123456'); // Replace with your email
  res.send('Check your email/console!');
});

// App Feedback Routes
app.get('/feedback', (req, res) => {
  if (!req.session.userId) return res.redirect('/login');
  res.render('feedback', { user: req.session.username });
});

app.post('/submit-feedback', async (req, res) => {
  try {
    if (!req.session.userId) return res.redirect('/login');
    
    const { rating, comment } = req.body;
    
    // Validation
    if (!rating || !comment || rating < 1 || rating > 5 || comment.trim().length === 0) {
      return res.render('error', { 
        msg: 'Invalid Feedback', 
        user: req.session.username, 
        detail: 'Rating must be 1-5, and comment cannot be empty.' 
      });
    }
    
    const AppFeedback = require('./models/AppFeedback');
    const newFeedback = new AppFeedback({ 
      user: req.session.userId, 
      rating: parseInt(rating), 
      comment: comment.trim() 
    });
    await newFeedback.save();
    
    // Send thank-you email
    const User = require('./models/User');
    const user = await User.findById(req.session.userId);
    if (user && user.email) {
      const mailOptions = {
        from: `"PeerView" <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject: 'Thank You for Your PeerView Feedback!',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #28a745;">Thanks for Your Feedback!</h2>
            <p>Hi ${user.username},</p>
            <p>We appreciate you taking the time to rate PeerView ${rating}/5 and share: "${comment.substring(0, 100)}..."</p>
            <p>Your input helps us improve. We'll review it soon!</p>
            <p><a href="http://localhost:5000">Back to PeerView</a></p>
            <hr style="border: 1px solid #ddd;">
            <p style="font-size: 12px; color: #666;">&copy; 2025 PeerView</p>
          </div>
        `
      };
      await transporter.sendMail(mailOptions);
      console.log(`✅ Thank-you email sent to ${user.email}`);
    } else {
      console.log('⚠️ User email not found; skipped thank-you email');
    }
    
    res.render('success', { 
      msg: 'Feedback Submitted!', 
      user: req.session.username, 
      detail: `Thanks! Your rating (${rating}/5) and comment have been saved. Check your email for a thank-you note.` 
    });
  } catch (err) {
    console.error('Feedback Submission Error:', err);
    res.render('error', { 
      msg: 'Feedback Submission Failed.', 
      user: req.session.username, 
      detail: err.message || 'Please try again.' 
    });
  }
});

// Admin View: List All Feedbacks (add auth/role check if needed)
app.get('/feedbacks', async (req, res) => {
  if (!req.session.userId) return res.redirect('/login');
  try {
    const AppFeedback = require('./models/AppFeedback');
    const feedbacks = await AppFeedback.find().populate('user', 'username').sort({ submittedAt: -1 });
    res.render('feedbacks', { user: req.session.username, feedbacks });
  } catch (err) {
    res.render('error', { 
      msg: 'Failed to Load Feedbacks.', 
      user: req.session.username, 
      detail: err.message 
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});