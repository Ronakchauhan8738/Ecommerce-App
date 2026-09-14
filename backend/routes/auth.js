const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { check, validationResult } = require('express-validator');
const User = require('../models/user');
const Otp = require('../models/otp');
const Order = require('../models/order');
const auth = require('../middleware/auth');
const { sendOtpEmail, verifySmtpConnection } = require('../services/emailService');
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;

// Generate a 6-digit OTP
function generateOtp() {
  return crypto.randomInt(100000, 999999).toString();
}

// In-memory rate limit for OTP resend (simple approach)
const resendCooldowns = new Map();
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds

/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       required:
 *         - name
 *         - email
 *         - password
 *       properties:
 *         id:
 *           type: string
 *           description: The auto-generated ID of the user
 *         name:
 *           type: string
 *           description: The user's name
 *         email:
 *           type: string
 *           description: The user's email
 *         password:
 *           type: string
 *           description: The user's hashed password
 *       example:
 *         id: 60c72b2f5f1b2c0012a4c56e
 *         name: John Doe
 *         email: john@example.com
 *         password: password123
 */

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: User's name
 *               email:
 *                 type: string
 *                 description: User's email
 *               password:
 *                 type: string
 *                 description: User's password
 *             example:
 *               name: John Doe
 *               email: john@example.com
 *               password: password123
 *     responses:
 *       200:
 *         description: User registered and JWT token returned (expires in 24 hours)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                   description: JWT token for user authentication
 *       400:
 *         description: Bad request - Validation error or user already exists
 *       500:
 *         description: Server error
 */
router.post(
  '/register',
  [
    check('name', 'Name is required').not().isEmpty(),
    check('email', 'Please include a valid email').isEmail(),
    check('password', 'Please enter a password with 6 or more characters').isLength({ min: 6 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, password } = req.body;

    try {
      let user = await User.findOne({ email });
      if (user) {
        return res.status(400).json({ msg: 'User already exists' });
      }

      user = new User({
        name,
        email,
        password,
      });

      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(password, salt);

      await user.save();

      // Generate and send OTP
      const otpCode = generateOtp();
      const otpSalt = await bcrypt.genSalt(10);
      const hashedOtp = await bcrypt.hash(otpCode, otpSalt);

      // Remove any existing OTPs for this email
      await Otp.deleteMany({ email });

      await new Otp({
        email,
        otp: hashedOtp,
        purpose: 'registration',
      }).save();

      // Send OTP email (logs to console if SMTP not configured)
      let emailResult = { sent: false, isDev: true };
      try {
        emailResult = await sendOtpEmail(email, otpCode, name);
      } catch (emailErr) {
        console.error('Failed to send OTP email:', emailErr.message);
      }

      const payload = {
        user: {
          id: user.id,
        },
      };

      jwt.sign(payload, JWT_SECRET, { expiresIn: '48h' }, (err, token) => {
        if (err) throw err;
        res.json({
          token,
          emailVerified: false,
          emailSent: Boolean(emailResult?.sent),
          devOtp: emailResult?.devOtp || undefined,
          devNotice: emailResult?.sent ? undefined : emailResult?.reason,
        });
      });
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server error');
    }
  }
);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Authenticate a user and return a JWT token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 description: User's email
 *               password:
 *                 type: string
 *                 description: User's password
 *             example:
 *               email: john@example.com
 *               password: password123
 *     responses:
 *       200:
 *         description: User authenticated and JWT token returned (expires in 24 hours)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                   description: JWT token for user authentication
 *       400:
 *         description: Invalid credentials or validation error
 *       500:
 *         description: Server error
 */
router.post('/login', [check('email', 'Please include a valid email').isEmail(), check('password', 'Password is required').exists()], async (req, res) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password } = req.body;

  try {
    let user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ msg: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ msg: 'Invalid credentials' });
    }

    const payload = {
      user: {
        id: user.id,
      },
    };

    jwt.sign(payload, JWT_SECRET, { expiresIn: '48h' }, (err, token) => {
      if (err) throw err;
      res.json({ token, emailVerified: user.emailVerified });
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

/**
 * POST /api/auth/verify-otp
 * Verify a 6-digit OTP for email verification
 */
router.post(
  '/verify-otp',
  [
    check('email', 'Please include a valid email').isEmail(),
    check('otp', 'OTP is required').isLength({ min: 6, max: 6 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, otp } = req.body;

    try {
      const otpRecord = await Otp.findOne({ email });

      if (!otpRecord) {
        return res.status(400).json({ msg: 'OTP has expired or does not exist. Please request a new one.' });
      }

      // Check attempt limit
      if (otpRecord.attempts >= 5) {
        await Otp.deleteOne({ _id: otpRecord._id });
        return res.status(429).json({ msg: 'Too many failed attempts. Please request a new OTP.' });
      }

      // Verify OTP
      const isValid = await bcrypt.compare(otp, otpRecord.otp);

      if (!isValid) {
        otpRecord.attempts += 1;
        await otpRecord.save();
        const remaining = 5 - otpRecord.attempts;
        return res.status(400).json({
          msg: `Invalid OTP. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`,
        });
      }

      // OTP valid — mark email as verified
      await User.findOneAndUpdate(
        { email },
        { emailVerified: true, emailVerifiedAt: new Date() }
      );

      // Delete the OTP record
      await Otp.deleteOne({ _id: otpRecord._id });

      res.json({ msg: 'Email verified successfully!', emailVerified: true });
    } catch (err) {
      console.error('verify-otp error:', err.message);
      res.status(500).send('Server error');
    }
  }
);

/**
 * POST /api/auth/resend-otp
 * Resend OTP for email verification (60s cooldown)
 */
router.post(
  '/resend-otp',
  [check('email', 'Please include a valid email').isEmail()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email } = req.body;

    try {
      // Rate limit check
      const lastSent = resendCooldowns.get(email);
      if (lastSent && Date.now() - lastSent < RESEND_COOLDOWN_MS) {
        const waitSec = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - lastSent)) / 1000);
        return res.status(429).json({ msg: `Please wait ${waitSec} seconds before requesting another OTP.` });
      }

      const user = await User.findOne({ email });
      if (!user) {
        return res.status(400).json({ msg: 'User not found.' });
      }

      if (user.emailVerified) {
        return res.status(400).json({ msg: 'Email is already verified.' });
      }

      // Generate new OTP
      const otpCode = generateOtp();
      const otpSalt = await bcrypt.genSalt(10);
      const hashedOtp = await bcrypt.hash(otpCode, otpSalt);

      // Replace existing OTP
      await Otp.deleteMany({ email });
      await new Otp({
        email,
        otp: hashedOtp,
        purpose: 'registration',
      }).save();

      // Send email
      let emailResult = { sent: false, isDev: true };
      try {
        emailResult = await sendOtpEmail(email, otpCode, user.name);
      } catch (emailErr) {
        console.error('Failed to send OTP email:', emailErr.message);
      }

      // Set cooldown
      resendCooldowns.set(email, Date.now());

      res.json({
        msg: emailResult?.sent
          ? 'A new OTP has been sent to your email.'
          : 'SMTP not configured in backend/.env. Check server terminal for OTP.',
        emailSent: Boolean(emailResult?.sent),
        devOtp: emailResult?.devOtp || undefined,
        devNotice: emailResult?.sent ? undefined : emailResult?.reason,
      });
    } catch (err) {
      console.error('resend-otp error:', err.message);
      res.status(500).send('Server error');
    }
  }
);

/**
 * GET /api/auth/smtp-status
 * Check SMTP connection status (for verification & testing)
 */
router.get('/smtp-status', async (req, res) => {
  try {
    const status = await verifySmtpConnection();
    res.json(status);
  } catch (err) {
    res.status(500).json({ connected: false, error: err.message });
  }
});

/**
 * GET /api/auth/me
 * Get current user's profile (protected)
 */
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    console.error('me error:', err.message);
    res.status(500).send('Server error');
  }
});

/**
 * GET /api/auth/profile or /api/user/profile
 * Get current user profile with standardized fields (protected)
 */
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }
    res.json({
      id: user._id,
      _id: user._id,
      name: user.name || '',
      email: user.email || '',
      phone: user.phone || '',
      avatar: user.avatar || '',
      profileImage: user.avatar || '',
      emailVerified: Boolean(user.emailVerified),
      emailVerifiedAt: user.emailVerifiedAt || null,
      createdAt: user.date,
      date: user.date,
    });
  } catch (err) {
    console.error('profile get error:', err.message);
    res.status(500).send('Server error');
  }
});

/**
 * PUT /api/auth/profile
 * Update user profile (name, phone, avatar) (protected)
 */
router.put('/profile', auth, async (req, res) => {
  try {
    const { name, phone, avatar } = req.body;
    const updates = {};

    if (name && name.trim()) updates.name = name.trim();
    if (typeof phone === 'string') updates.phone = phone.trim();
    if (typeof avatar === 'string') updates.avatar = avatar.trim();

    if (!Object.keys(updates).length) {
      return res.status(400).json({ msg: 'No valid fields to update.' });
    }

    const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true }).select('-password');
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    res.json(user);
  } catch (err) {
    console.error('profile update error:', err.message);
    res.status(500).send('Server error');
  }
});

/**
 * PUT /api/auth/change-password
 * Change password (requires current password) (protected)
 */
router.put(
  '/change-password',
  [
    auth,
    check('currentPassword', 'Current password is required').exists(),
    check('newPassword', 'New password must be at least 6 characters').isLength({ min: 6 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { currentPassword, newPassword } = req.body;

    try {
      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ msg: 'User not found' });
      }

      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(400).json({ msg: 'Current password is incorrect.' });
      }

      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(newPassword, salt);
      await user.save();

      res.json({ msg: 'Password changed successfully.' });
    } catch (err) {
      console.error('change-password error:', err.message);
      res.status(500).send('Server error');
    }
  }
);

/**
 * GET /api/auth/my-orders
 * Get orders for the authenticated user (protected)
 */
router.get('/my-orders', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('email');
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    const orders = await Order.find({
      $or: [
        { user: req.user.id },
        { email: user.email.toLowerCase() },
      ],
    })
      .sort({ createdAt: -1 })
      .lean();

    res.json(orders);
  } catch (err) {
    console.error('my-orders error:', err.message);
    res.status(500).send('Server error');
  }
});

/**
 * @swagger
 * /api/auth/verify-email:
 *   post:
 *     summary: Verify if an email exists in the system
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 description: User's email to verify
 *             example:
 *               email: john@example.com
 *     responses:
 *       200:
 *         description: Email exists and is valid for password reset
 *       400:
 *         description: Invalid email or user not found
 *       500:
 *         description: Server error
 */
router.post('/verify-email', [check('email', 'Please include a valid email').isEmail()], async (req, res) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email } = req.body;

  try {
    let user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ msg: 'Invalid email. User not found' });
    }

    res.json({ msg: 'Email is valid, you can proceed to reset your password' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Reset a user's password
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 description: User's email
 *               password:
 *                 type: string
 *                 description: New password for the user
 *             example:
 *               email: john@example.com
 *               password: newpassword123
 *     responses:
 *       200:
 *         description: Password reset successfully
 *       400:
 *         description: Invalid email or validation error
 *       500:
 *         description: Server error
 */
router.post(
  '/reset-password',
  [check('email', 'Please include a valid email').isEmail(), check('password', 'Please enter a password with 6 or more characters').isLength({ min: 6 })],
  async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    try {
      let user = await User.findOne({ email });

      if (!user) {
        return res.status(400).json({ msg: 'Invalid email. User not found' });
      }

      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(password, salt);
      await user.save();

      res.json({ msg: 'Password successfully reset' });
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server error');
    }
  }
);

module.exports = router;
