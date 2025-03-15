require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { createProxyMiddleware } = require('http-proxy-middleware');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Authentication middleware
const authenticateToken = (req, res, next) => {
  // For Phase 1, we'll skip authentication
  // This will be implemented in later phases
  next();
};

// Service routes
const VOICE_SERVICE_URL = process.env.VOICE_SERVICE_URL || 'http://localhost:3001';
const USER_PROFILE_SERVICE_URL = process.env.USER_PROFILE_SERVICE_URL || 'http://localhost:3002';
const JOB_SEARCH_SERVICE_URL = process.env.JOB_SEARCH_SERVICE_URL || 'http://localhost:3003';
const ROLE_SUGGESTION_SERVICE_URL = process.env.ROLE_SUGGESTION_SERVICE_URL || 'http://localhost:3004';

// Voice Interaction Service
app.use('/api/voice', authenticateToken, createProxyMiddleware({
  target: VOICE_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: {
    '^/api/voice': '/api',
  },
}));

// User Profile Service
app.use('/api/users', authenticateToken, createProxyMiddleware({
  target: USER_PROFILE_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: {
    '^/api/users': '/api',
  },
}));

// Job Search Service
app.use('/api/jobs', authenticateToken, createProxyMiddleware({
  target: JOB_SEARCH_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: {
    '^/api/jobs': '/api',
  },
}));

// Role Suggestion Service
app.use('/api/roles', authenticateToken, createProxyMiddleware({
  target: ROLE_SUGGESTION_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: {
    '^/api/roles': '/api',
  },
}));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'api-gateway' });
});

// Start the server
app.listen(PORT, () => {
  console.log(`API Gateway running on port ${PORT}`);
});