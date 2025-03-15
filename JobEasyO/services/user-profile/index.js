require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const Joi = require('joi');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3002;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/jobeasy-user-profiles';

// Connect to MongoDB
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('Failed to connect to MongoDB:', err));

// Define User Profile Schema
const userProfileSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  basic: {
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String },
    location: {
      city: { type: String },
      state: { type: String },
      country: { type: String },
      preferredLocations: [{ type: String }]
    }
  },
  preferences: {
    remoteWork: { type: Boolean, default: false },
    employmentTypes: [{ type: String, enum: ['Full-time', 'Part-time', 'Contract', 'Freelance', 'Internship'] }],
    salaryExpectations: {
      minimum: { type: Number },
      target: { type: Number },
      currency: { type: String, default: 'USD' }
    },
    workEnvironments: [{ type: String }]
  },
  professional: {
    currentTitle: { type: String },
    desiredTitles: [{ type: String }],
    totalExperience: { type: Number }, // in years
    industries: [{ type: String }],
    roles: [{ type: String }]
  },
  skills: [{
    name: { type: String, required: true },
    level: { type: String, enum: ['Beginner', 'Intermediate', 'Expert'] },
    yearsOfExperience: { type: Number }
  }],
  education: [{
    degree: { type: String },
    institution: { type: String },
    fieldOfStudy: { type: String },
    graduationYear: { type: Number }
  }],
  certifications: [{
    name: { type: String },
    issuingOrganization: { type: String },
    issueDate: { type: Date },
    expirationDate: { type: Date },
    credentialId: { type: String }
  }],
  conversationState: {
    currentNode: { type: String, default: 'initial' },
    completedSections: [{ type: String }],
    lastInteractionTime: { type: Date, default: Date.now }
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Create User Profile Model
const UserProfile = mongoose.model('UserProfile', userProfileSchema);

// Validation Schemas
const createProfileSchema = Joi.object({
  userId: Joi.string().required(),
  basic: Joi.object({
    name: Joi.string().required(),
    email: Joi.string().email().required(),
    phone: Joi.string(),
    location: Joi.object({
      city: Joi.string(),
      state: Joi.string(),
      country: Joi.string(),
      preferredLocations: Joi.array().items(Joi.string())
    })
  }).required(),
  preferences: Joi.object({
    remoteWork: Joi.boolean(),
    employmentTypes: Joi.array().items(Joi.string().valid('Full-time', 'Part-time', 'Contract', 'Freelance', 'Internship')),
    salaryExpectations: Joi.object({
      minimum: Joi.number(),
      target: Joi.number(),
      currency: Joi.string()
    }),
    workEnvironments: Joi.array().items(Joi.string())
  }),
  professional: Joi.object({
    currentTitle: Joi.string(),
    desiredTitles: Joi.array().items(Joi.string()),
    totalExperience: Joi.number(),
    industries: Joi.array().items(Joi.string()),
    roles: Joi.array().items(Joi.string())
  }),
  skills: Joi.array().items(Joi.object({
    name: Joi.string().required(),
    level: Joi.string().valid('Beginner', 'Intermediate', 'Expert'),
    yearsOfExperience: Joi.number()
  })),
  education: Joi.array().items(Joi.object({
    degree: Joi.string(),
    institution: Joi.string(),
    fieldOfStudy: Joi.string(),
    graduationYear: Joi.number()
  })),
  certifications: Joi.array().items(Joi.object({
    name: Joi.string(),
    issuingOrganization: Joi.string(),
    issueDate: Joi.date(),
    expirationDate: Joi.date(),
    credentialId: Joi.string()
  }))
});

// Middleware
app.use(cors());
app.use(express.json());

// API endpoints
app.post('/api', async (req, res) => {
  try {
    // Validate request body
    const { error, value } = createProfileSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    
    // Check if profile already exists
    const existingProfile = await UserProfile.findOne({ userId: value.userId });
    if (existingProfile) {
      return res.status(409).json({ error: 'Profile already exists for this user' });
    }
    
    // Create new profile
    const newProfile = new UserProfile(value);
    await newProfile.save();
    
    return res.status(201).json(newProfile);
  } catch (error) {
    console.error('Error creating profile:', error);
    return res.status(500).json({ error: 'Error creating profile' });
  }
});

app.get('/api/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Find profile by userId
    const profile = await UserProfile.findOne({ userId });
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    return res.json(profile);
  } catch (error) {
    console.error('Error retrieving profile:', error);
    return res.status(500).json({ error: 'Error retrieving profile' });
  }
});

app.patch('/api/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Find profile by userId
    const profile = await UserProfile.findOne({ userId });
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    // Update profile fields
    Object.keys(req.body).forEach(key => {
      if (key !== 'userId' && key !== 'createdAt') {
        profile[key] = req.body[key];
      }
    });
    
    // Update updatedAt timestamp
    profile.updatedAt = Date.now();
    
    // Save updated profile
    await profile.save();
    
    return res.json(profile);
  } catch (error) {
    console.error('Error updating profile:', error);
    return res.status(500).json({ error: 'Error updating profile' });
  }
});

app.put('/api/:userId/preferences', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Find profile by userId
    const profile = await UserProfile.findOne({ userId });
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    // Update preferences
    profile.preferences = req.body;
    profile.updatedAt = Date.now();
    
    // Save updated profile
    await profile.save();
    
    return res.json(profile.preferences);
  } catch (error) {
    console.error('Error updating preferences:', error);
    return res.status(500).json({ error: 'Error updating preferences' });
  }
});

app.put('/api/:userId/skills', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Find profile by userId
    const profile = await UserProfile.findOne({ userId });
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    // Update skills
    profile.skills = req.body;
    profile.updatedAt = Date.now();
    
    // Save updated profile
    await profile.save();
    
    return res.json(profile.skills);
  } catch (error) {
    console.error('Error updating skills:', error);
    return res.status(500).json({ error: 'Error updating skills' });
  }
});

app.get('/api/:userId/completeness', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Find profile by userId
    const profile = await UserProfile.findOne({ userId });
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    // Calculate profile completeness
    const requiredFields = [
      'basic.name',
      'basic.email',
      'professional.currentTitle',
      'professional.totalExperience',
      'skills'
    ];
    
    const optionalFields = [
      'basic.phone',
      'basic.location',
      'preferences.remoteWork',
      'preferences.employmentTypes',
      'preferences.salaryExpectations',
      'professional.desiredTitles',
      'professional.industries',
      'professional.roles',
      'education',
      'certifications'
    ];
    
    let completedRequired = 0;
    let completedOptional = 0;
    
    // Check required fields
    requiredFields.forEach(field => {
      const value = field.split('.').reduce((obj, key) => obj && obj[key], profile);
      if (value && (Array.isArray(value) ? value.length > 0 : true)) {
        completedRequired++;
      }
    });
    
    // Check optional fields
    optionalFields.forEach(field => {
      const value = field.split('.').reduce((obj, key) => obj && obj[key], profile);
      if (value && (Array.isArray(value) ? value.length > 0 : true)) {
        completedOptional++;
      }
    });
    
    const requiredPercentage = (completedRequired / requiredFields.length) * 70;
    const optionalPercentage = (completedOptional / optionalFields.length) * 30;
    const totalPercentage = Math.round(requiredPercentage + optionalPercentage);
    
    // Get missing required fields
    const missingRequired = requiredFields.filter(field => {
      const value = field.split('.').reduce((obj, key) => obj && obj[key], profile);
      return !value || (Array.isArray(value) && value.length === 0);
    });
    
    return res.json({
      completeness: totalPercentage,
      missingRequired,
      completedRequired,
      totalRequired: requiredFields.length,
      completedOptional,
      totalOptional: optionalFields.length
    });
  } catch (error) {
    console.error('Error calculating profile completeness:', error);
    return res.status(500).json({ error: 'Error calculating profile completeness' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'user-profile' });
});

// Start the server
app.listen(PORT, () => {
  console.log(`User Profile Service running on port ${PORT}`);
});