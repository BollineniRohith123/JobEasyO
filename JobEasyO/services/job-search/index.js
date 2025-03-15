require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const mongoose = require('mongoose');
const natural = require('natural');
const { TfIdf } = natural;

const app = express();
const PORT = process.env.PORT || 3003;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/jobeasy-job-search';
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY || 'your-api-key';

// Connect to MongoDB
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('Failed to connect to MongoDB:', err));

// Define Job Schema
const jobSchema = new mongoose.Schema({
  title: { type: String, required: true },
  company: { type: String, required: true },
  location: { type: String },
  description: { type: String },
  requirements: [{ type: String }],
  salary: { type: String },
  url: { type: String, required: true },
  source: { type: String, required: true },
  remote: { type: Boolean, default: false },
  employmentType: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Create Job Model
const Job = mongoose.model('Job', jobSchema);

// Middleware
app.use(cors());
app.use(express.json());

// Perplexity API Client
class PerplexityClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.perplexity.ai';
  }
  
  async searchJobs(query) {
    try {
      const response = await axios.post(`${this.baseUrl}/chat/completions`, {
        model: 'pplx-7b-online',
        messages: [
          {
            role: 'system',
            content: 'You are a job search assistant. Your task is to search for job listings based on the user\'s query and return the results in a structured JSON format. Each job should include title, company, location, description, requirements, salary (if available), and URL.'
          },
          {
            role: 'user',
            content: `Search for jobs with the following criteria: ${query}. Return results in JSON format with the following structure: { "jobs": [{ "title": "", "company": "", "location": "", "description": "", "requirements": [], "salary": "", "url": "", "remote": boolean, "employmentType": "" }] }`
          }
        ],
        max_tokens: 1024
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        }
      });
      
      // Extract and parse the JSON response
      const content = response.data.choices[0].message.content;
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/({[\s\S]*})/);
      
      if (jsonMatch && jsonMatch[1]) {
        return JSON.parse(jsonMatch[1]);
      } else {
        throw new Error('Failed to parse JSON response from Perplexity API');
      }
    } catch (error) {
      console.error('Error searching jobs with Perplexity API:', error);
      throw error;
    }
  }
}

// Initialize Perplexity Client
const perplexityClient = new PerplexityClient(PERPLEXITY_API_KEY);

// Job Matching Engine
class JobMatchingEngine {
  constructor() {
    this.tfidf = new TfIdf();
  }
  
  preprocessText(text) {
    return text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  calculateMatchScore(job, userProfile) {
    // Reset TF-IDF
    this.tfidf = new TfIdf();
    
    // Add job document
    const jobDocument = `${job.title} ${job.company} ${job.description} ${job.requirements.join(' ')}`;
    this.tfidf.addDocument(this.preprocessText(jobDocument));
    
    // Add user profile document
    let userSkills = '';
    if (userProfile.skills && userProfile.skills.length > 0) {
      userSkills = userProfile.skills.map(skill => skill.name).join(' ');
    }
    
    let userRoles = '';
    if (userProfile.professional && userProfile.professional.desiredTitles) {
      userRoles = userProfile.professional.desiredTitles.join(' ');
    }
    
    const userDocument = `${userRoles} ${userSkills}`;
    this.tfidf.addDocument(this.preprocessText(userDocument));
    
    // Calculate similarity score
    let totalScore = 0;
    let termCount = 0;
    
    // Get terms from user document
    const userTerms = this.preprocessText(userDocument).split(' ');
    
    userTerms.forEach(term => {
      if (term.length > 2) { // Ignore short terms
        const jobScore = this.tfidf.tfidf(term, 0);
        const userScore = this.tfidf.tfidf(term, 1);
        
        if (jobScore > 0) {
          totalScore += (jobScore * userScore);
          termCount++;
        }
      }
    });
    
    // Calculate final score (0-100)
    const finalScore = termCount > 0 ? Math.min(100, Math.round((totalScore / termCount) * 100)) : 0;
    
    // Adjust score based on location and employment type preferences
    let adjustedScore = finalScore;
    
    // Location adjustment
    if (userProfile.preferences && userProfile.preferences.remoteWork && job.remote) {
      adjustedScore += 10;
    } else if (userProfile.basic && userProfile.basic.location && job.location) {
      const userLocation = userProfile.basic.location.city || userProfile.basic.location.state || userProfile.basic.location.country;
      if (userLocation && job.location.toLowerCase().includes(userLocation.toLowerCase())) {
        adjustedScore += 10;
      }
    }
    
    // Employment type adjustment
    if (userProfile.preferences && userProfile.preferences.employmentTypes && job.employmentType) {
      if (userProfile.preferences.employmentTypes.includes(job.employmentType)) {
        adjustedScore += 10;
      }
    }
    
    // Cap score at 100
    return Math.min(100, adjustedScore);
  }
}

// Initialize Job Matching Engine
const jobMatchingEngine = new JobMatchingEngine();

// API endpoints
app.post('/api/search', async (req, res) => {
  try {
    const { query, userProfile } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }
    
    // Search jobs with Perplexity API
    const results = await perplexityClient.searchJobs(query);
    
    // Store jobs in database
    const jobs = results.jobs || [];
    const savedJobs = [];
    
    for (const job of jobs) {
      // Check if job already exists
      const existingJob = await Job.findOne({ url: job.url });
      
      if (!existingJob) {
        // Create new job
        const newJob = new Job({
          title: job.title,
          company: job.company,
          location: job.location,
          description: job.description,
          requirements: job.requirements,
          salary: job.salary,
          url: job.url,
          source: 'perplexity',
          remote: job.remote || false,
          employmentType: job.employmentType
        });
        
        await newJob.save();
        savedJobs.push(newJob);
      } else {
        savedJobs.push(existingJob);
      }
    }
    
    // Calculate match scores if user profile is provided
    let jobsWithScores = savedJobs;
    
    if (userProfile) {
      jobsWithScores = savedJobs.map(job => {
        const score = jobMatchingEngine.calculateMatchScore(job, userProfile);
        return {
          ...job.toObject(),
          matchScore: score
        };
      });
      
      // Sort by match score (descending)
      jobsWithScores.sort((a, b) => b.matchScore - a.matchScore);
    }
    
    return res.json({
      jobs: jobsWithScores,
      total: jobsWithScores.length
    });
  } catch (error) {
    console.error('Error searching jobs:', error);
    return res.status(500).json({ error: 'Error searching jobs' });
  }
});

app.get('/api/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    
    // Find job by ID
    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    return res.json(job);
  } catch (error) {
    console.error('Error retrieving job:', error);
    return res.status(500).json({ error: 'Error retrieving job' });
  }
});

app.post('/api/match', async (req, res) => {
  try {
    const { jobId, userProfile } = req.body;
    
    if (!jobId || !userProfile) {
      return res.status(400).json({ error: 'Job ID and user profile are required' });
    }
    
    // Find job by ID
    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Calculate match score
    const score = jobMatchingEngine.calculateMatchScore(job, userProfile);
    
    return res.json({
      job,
      matchScore: score
    });
  } catch (error) {
    console.error('Error calculating match score:', error);
    return res.status(500).json({ error: 'Error calculating match score' });
  }
});

app.get('/api/trending', async (req, res) => {
  try {
    const { industry, location } = req.query;
    
    // Build query
    const query = {};
    
    if (industry) {
      query.description = { $regex: industry, $options: 'i' };
    }
    
    if (location) {
      query.location = { $regex: location, $options: 'i' };
    }
    
    // Find trending jobs (most recently added)
    const trendingJobs = await Job.find(query)
      .sort({ createdAt: -1 })
      .limit(10);
    
    return res.json(trendingJobs);
  } catch (error) {
    console.error('Error retrieving trending jobs:', error);
    return res.status(500).json({ error: 'Error retrieving trending jobs' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'job-search' });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Job Search Service running on port ${PORT}`);
});