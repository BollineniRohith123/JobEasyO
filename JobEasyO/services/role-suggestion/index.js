require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const natural = require('natural');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3004;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/jobeasy-role-suggestion';

// Connect to MongoDB
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('Failed to connect to MongoDB:', err));

// Define Role Schema
const roleSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  requiredSkills: [{ type: String }],
  relatedSkills: [{ type: String }],
  averageSalary: { type: String },
  growthRate: { type: String },
  industry: { type: String },
  educationRequirements: [{ type: String }],
  experienceLevel: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Create Role Model
const Role = mongoose.model('Role', roleSchema);

// Define Skill to Role Mapping Schema
const skillToRoleSchema = new mongoose.Schema({
  skill: { type: String, required: true, unique: true },
  roles: [{
    title: { type: String, required: true },
    relevanceScore: { type: Number, required: true } // 0-100
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Create Skill to Role Mapping Model
const SkillToRole = mongoose.model('SkillToRole', skillToRoleSchema);

// Middleware
app.use(cors());
app.use(express.json());

// Skill Analysis Engine
class SkillAnalysisEngine {
  constructor() {
    this.tokenizer = new natural.WordTokenizer();
    this.stemmer = natural.PorterStemmer;
  }
  
  async analyzeUserSkills(userSkills) {
    try {
      // Extract skill names
      const skillNames = userSkills.map(skill => skill.name.toLowerCase());
      
      // Find skill clusters
      const skillClusters = await this.identifySkillClusters(skillNames);
      
      // Find unique skills
      const uniqueSkills = await this.identifyUniqueSkills(skillNames);
      
      // Find missing core skills
      const missingCoreSkills = await this.identifyMissingCoreSkills(skillClusters[0], skillNames);
      
      return {
        primaryCluster: skillClusters[0],
        secondaryCluster: skillClusters[1],
        uniqueSkills,
        missingCoreSkills
      };
    } catch (error) {
      console.error('Error analyzing user skills:', error);
      throw error;
    }
  }
  
  async identifySkillClusters(skillNames) {
    try {
      // Get all skill to role mappings for the user's skills
      const skillMappings = await SkillToRole.find({ skill: { $in: skillNames } });
      
      // Count role occurrences
      const roleCounts = {};
      
      skillMappings.forEach(mapping => {
        mapping.roles.forEach(role => {
          if (!roleCounts[role.title]) {
            roleCounts[role.title] = {
              count: 0,
              totalRelevance: 0
            };
          }
          
          roleCounts[role.title].count += 1;
          roleCounts[role.title].totalRelevance += role.relevanceScore;
        });
      });
      
      // Calculate average relevance and sort roles
      const sortedRoles = Object.keys(roleCounts).map(title => ({
        title,
        count: roleCounts[title].count,
        averageRelevance: roleCounts[title].totalRelevance / roleCounts[title].count
      })).sort((a, b) => {
        // Sort by count first, then by average relevance
        if (b.count !== a.count) {
          return b.count - a.count;
        }
        return b.averageRelevance - a.averageRelevance;
      });
      
      // Group roles into clusters
      const clusters = [];
      
      if (sortedRoles.length > 0) {
        // Get roles for the first cluster
        const primaryClusterRoles = sortedRoles.filter(role => 
          role.count >= sortedRoles[0].count * 0.7 || 
          role.averageRelevance >= sortedRoles[0].averageRelevance * 0.8
        ).map(role => role.title);
        
        clusters.push(primaryClusterRoles);
        
        // Get roles for the second cluster (excluding primary cluster)
        const remainingRoles = sortedRoles.filter(role => !primaryClusterRoles.includes(role.title));
        
        if (remainingRoles.length > 0) {
          const secondaryClusterRoles = remainingRoles.filter(role => 
            role.count >= remainingRoles[0].count * 0.7 || 
            role.averageRelevance >= remainingRoles[0].averageRelevance * 0.8
          ).map(role => role.title);
          
          clusters.push(secondaryClusterRoles);
        } else {
          clusters.push([]);
        }
      } else {
        clusters.push([]);
        clusters.push([]);
      }
      
      return clusters;
    } catch (error) {
      console.error('Error identifying skill clusters:', error);
      throw error;
    }
  }
  
  async identifyUniqueSkills(skillNames) {
    try {
      // Get all skill to role mappings for the user's skills
      const skillMappings = await SkillToRole.find({ skill: { $in: skillNames } });
      
      // Calculate uniqueness score for each skill
      const uniquenessScores = {};
      
      skillMappings.forEach(mapping => {
        const roleCount = mapping.roles.length;
        const averageRelevance = mapping.roles.reduce((sum, role) => sum + role.relevanceScore, 0) / roleCount;
        
        // Higher relevance and lower role count means more unique
        uniquenessScores[mapping.skill] = averageRelevance / (roleCount * 0.5);
      });
      
      // Sort skills by uniqueness score
      const sortedSkills = Object.keys(uniquenessScores).sort((a, b) => uniquenessScores[b] - uniquenessScores[a]);
      
      // Return top 5 unique skills
      return sortedSkills.slice(0, 5);
    } catch (error) {
      console.error('Error identifying unique skills:', error);
      throw error;
    }
  }
  
  async identifyMissingCoreSkills(clusterRoles, userSkills) {
    try {
      if (clusterRoles.length === 0) {
        return [];
      }
      
      // Get roles
      const roles = await Role.find({ title: { $in: clusterRoles } });
      
      // Count skill occurrences across roles
      const skillCounts = {};
      
      roles.forEach(role => {
        role.requiredSkills.forEach(skill => {
          if (!skillCounts[skill]) {
            skillCounts[skill] = 0;
          }
          
          skillCounts[skill] += 1;
        });
      });
      
      // Calculate core skills (skills that appear in at least 70% of roles)
      const coreSkillThreshold = roles.length * 0.7;
      const coreSkills = Object.keys(skillCounts).filter(skill => skillCounts[skill] >= coreSkillThreshold);
      
      // Find missing core skills
      const missingCoreSkills = coreSkills.filter(skill => !userSkills.includes(skill.toLowerCase()));
      
      return missingCoreSkills;
    } catch (error) {
      console.error('Error identifying missing core skills:', error);
      throw error;
    }
  }
}

// Role Recommendation Engine
class RoleRecommendationEngine {
  constructor(skillAnalysisEngine) {
    this.skillAnalysisEngine = skillAnalysisEngine;
  }
  
  async generateRoleRecommendations(userProfile) {
    try {
      // Analyze user skills
      const skillAnalysis = await this.skillAnalysisEngine.analyzeUserSkills(userProfile.skills);
      
      // Get primary role matches
      const primaryRoles = await this.matchRolesForSkillCluster(skillAnalysis.primaryCluster);
      
      // Get secondary role matches
      const secondaryRoles = await this.matchRolesForSkillCluster(skillAnalysis.secondaryCluster);
      
      // Get roles based on unique skills
      const uniqueSkillRoles = await this.matchRolesForUniqueSkills(skillAnalysis.uniqueSkills);
      
      // Combine and rank recommendations
      const recommendations = this.rankRecommendations([
        ...primaryRoles.map(r => ({ ...r, type: 'primary' })),
        ...secondaryRoles.map(r => ({ ...r, type: 'secondary' })),
        ...uniqueSkillRoles.map(r => ({ ...r, type: 'unique' }))
      ]);
      
      // Enrich recommendations with market data
      const enrichedRecommendations = await this.enrichRecommendationsWithMarketData(recommendations);
      
      return enrichedRecommendations;
    } catch (error) {
      console.error('Error generating role recommendations:', error);
      throw error;
    }
  }
  
  async matchRolesForSkillCluster(clusterRoles) {
    try {
      if (clusterRoles.length === 0) {
        return [];
      }
      
      // Get roles
      const roles = await Role.find({ title: { $in: clusterRoles } });
      
      return roles;
    } catch (error) {
      console.error('Error matching roles for skill cluster:', error);
      throw error;
    }
  }
  
  async matchRolesForUniqueSkills(uniqueSkills) {
    try {
      if (uniqueSkills.length === 0) {
        return [];
      }
      
      // Get skill to role mappings for unique skills
      const skillMappings = await SkillToRole.find({ skill: { $in: uniqueSkills } });
      
      // Get role titles with high relevance scores
      const roleSet = new Set();
      
      skillMappings.forEach(mapping => {
        mapping.roles.forEach(role => {
          if (role.relevanceScore >= 80) {
            roleSet.add(role.title);
          }
        });
      });
      
      // Get roles
      const roles = await Role.find({ title: { $in: Array.from(roleSet) } });
      
      return roles;
    } catch (error) {
      console.error('Error matching roles for unique skills:', error);
      throw error;
    }
  }
  
  rankRecommendations(recommendations) {
    // Remove duplicates
    const uniqueRecommendations = [];
    const titleSet = new Set();
    
    recommendations.forEach(recommendation => {
      if (!titleSet.has(recommendation.title)) {
        titleSet.add(recommendation.title);
        uniqueRecommendations.push(recommendation);
      }
    });
    
    // Rank by type (primary > unique > secondary)
    const typeWeights = {
      'primary': 3,
      'unique': 2,
      'secondary': 1
    };
    
    uniqueRecommendations.sort((a, b) => typeWeights[b.type] - typeWeights[a.type]);
    
    return uniqueRecommendations;
  }
  
  async enrichRecommendationsWithMarketData(recommendations) {
    try {
      // In a real implementation, this would fetch market data from an external API
      // For now, we'll just return the recommendations as is
      return recommendations.map(recommendation => ({
        ...recommendation.toObject(),
        marketDemand: 'High',
        averageSalary: recommendation.averageSalary || '$80,000 - $120,000'
      }));
    } catch (error) {
      console.error('Error enriching recommendations with market data:', error);
      throw error;
    }
  }
  
  async generateSkillGapAnalysis(targetRole, userSkills) {
    try {
      // Get role
      const role = await Role.findOne({ title: targetRole });
      
      if (!role) {
        throw new Error(`Role not found: ${targetRole}`);
      }
      
      // Extract skill names
      const userSkillNames = userSkills.map(skill => skill.name.toLowerCase());
      
      // Find missing required skills
      const missingRequiredSkills = role.requiredSkills.filter(skill => !userSkillNames.includes(skill.toLowerCase()));
      
      // Find missing related skills
      const missingRelatedSkills = role.relatedSkills.filter(skill => !userSkillNames.includes(skill.toLowerCase()));
      
      return {
        role: role.toObject(),
        missingRequiredSkills,
        missingRelatedSkills,
        matchPercentage: Math.round((1 - (missingRequiredSkills.length / role.requiredSkills.length)) * 100)
      };
    } catch (error) {
      console.error('Error generating skill gap analysis:', error);
      throw error;
    }
  }
}

// Initialize engines
const skillAnalysisEngine = new SkillAnalysisEngine();
const roleRecommendationEngine = new RoleRecommendationEngine(skillAnalysisEngine);

// Seed initial data if database is empty
const seedInitialData = async () => {
  try {
    // Check if roles exist
    const roleCount = await Role.countDocuments();
    
    if (roleCount === 0) {
      console.log('Seeding initial role data...');
      
      // Seed roles
      const roles = [
        {
          title: 'Software Developer',
          description: 'Develops software applications using programming languages and frameworks.',
          requiredSkills: ['JavaScript', 'HTML', 'CSS', 'Git', 'Problem Solving'],
          relatedSkills: ['React', 'Node.js', 'Python', 'SQL', 'TypeScript'],
          averageSalary: '$80,000 - $120,000',
          growthRate: '22% (Much faster than average)',
          industry: 'Technology',
          educationRequirements: ['Bachelor\'s Degree in Computer Science or related field'],
          experienceLevel: 'Entry to Mid-Level'
        },
        {
          title: 'Data Scientist',
          description: 'Analyzes and interprets complex data to help organizations make better decisions.',
          requiredSkills: ['Python', 'Statistics', 'Machine Learning', 'Data Analysis', 'SQL'],
          relatedSkills: ['R', 'TensorFlow', 'PyTorch', 'Data Visualization', 'Big Data'],
          averageSalary: '$100,000 - $140,000',
          growthRate: '31% (Much faster than average)',
          industry: 'Technology',
          educationRequirements: ['Master\'s or PhD in Computer Science, Statistics, or related field'],
          experienceLevel: 'Mid to Senior Level'
        },
        {
          title: 'UX Designer',
          description: 'Designs user experiences for digital products and services.',
          requiredSkills: ['User Research', 'Wireframing', 'Prototyping', 'UI Design', 'Usability Testing'],
          relatedSkills: ['Figma', 'Adobe XD', 'Sketch', 'HTML', 'CSS'],
          averageSalary: '$75,000 - $110,000',
          growthRate: '13% (Faster than average)',
          industry: 'Technology',
          educationRequirements: ['Bachelor\'s Degree in Design, HCI, or related field'],
          experienceLevel: 'Entry to Mid-Level'
        },
        {
          title: 'Product Manager',
          description: 'Oversees the development and marketing of a product or product line.',
          requiredSkills: ['Product Strategy', 'Market Research', 'User Stories', 'Roadmapping', 'Stakeholder Management'],
          relatedSkills: ['Agile Methodologies', 'Data Analysis', 'UX Design', 'Technical Knowledge', 'Communication'],
          averageSalary: '$90,000 - $130,000',
          growthRate: '10% (Faster than average)',
          industry: 'Technology',
          educationRequirements: ['Bachelor\'s Degree in Business, Computer Science, or related field'],
          experienceLevel: 'Mid to Senior Level'
        },
        {
          title: 'DevOps Engineer',
          description: 'Combines software development and IT operations to shorten the development lifecycle.',
          requiredSkills: ['Linux', 'Scripting', 'CI/CD', 'Cloud Platforms', 'Containerization'],
          relatedSkills: ['Docker', 'Kubernetes', 'AWS', 'Azure', 'Terraform'],
          averageSalary: '$95,000 - $135,000',
          growthRate: '22% (Much faster than average)',
          industry: 'Technology',
          educationRequirements: ['Bachelor\'s Degree in Computer Science or related field'],
          experienceLevel: 'Mid to Senior Level'
        }
      ];
      
      await Role.insertMany(roles);
      
      // Seed skill to role mappings
      const skillToRoleMappings = [
        {
          skill: 'javascript',
          roles: [
            { title: 'Software Developer', relevanceScore: 95 },
            { title: 'Frontend Developer', relevanceScore: 100 },
            { title: 'Full Stack Developer', relevanceScore: 90 },
            { title: 'Web Developer', relevanceScore: 95 }
          ]
        },
        {
          skill: 'python',
          roles: [
            { title: 'Data Scientist', relevanceScore: 95 },
            { title: 'Machine Learning Engineer', relevanceScore: 90 },
            { title: 'Software Developer', relevanceScore: 70 },
            { title: 'Backend Developer', relevanceScore: 80 }
          ]
        },
        {
          skill: 'user research',
          roles: [
            { title: 'UX Designer', relevanceScore: 95 },
            { title: 'UX Researcher', relevanceScore: 100 },
            { title: 'Product Manager', relevanceScore: 75 }
          ]
        },
        {
          skill: 'product strategy',
          roles: [
            { title: 'Product Manager', relevanceScore: 100 },
            { title: 'Product Owner', relevanceScore: 90 },
            { title: 'Business Analyst', relevanceScore: 70 }
          ]
        },
        {
          skill: 'linux',
          roles: [
            { title: 'DevOps Engineer', relevanceScore: 95 },
            { title: 'System Administrator', relevanceScore: 90 },
            { title: 'Cloud Engineer', relevanceScore: 85 }
          ]
        }
      ];
      
      await SkillToRole.insertMany(skillToRoleMappings);
      
      console.log('Initial data seeded successfully');
    }
  } catch (error) {
    console.error('Error seeding initial data:', error);
  }
};

// API endpoints
app.post('/api/suggest', async (req, res) => {
  try {
    const { userProfile } = req.body;
    
    if (!userProfile || !userProfile.skills || userProfile.skills.length === 0) {
      return res.status(400).json({ error: 'User profile with skills is required' });
    }
    
    // Generate role recommendations
    const recommendations = await roleRecommendationEngine.generateRoleRecommendations(userProfile);
    
    return res.json({
      recommendations,
      total: recommendations.length
    });
  } catch (error) {
    console.error('Error suggesting roles:', error);
    return res.status(500).json({ error: 'Error suggesting roles' });
  }
});

app.get('/api/:roleId', async (req, res) => {
  try {
    const { roleId } = req.params;
    
    // Find role by ID
    const role = await Role.findById(roleId);
    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }
    
    return res.json(role);
  } catch (error) {
    console.error('Error retrieving role:', error);
    return res.status(500).json({ error: 'Error retrieving role' });
  }
});

app.post('/api/:roleTitle/gap-analysis', async (req, res) => {
  try {
    const { roleTitle } = req.params;
    const { userProfile } = req.body;
    
    if (!userProfile || !userProfile.skills || userProfile.skills.length === 0) {
      return res.status(400).json({ error: 'User profile with skills is required' });
    }
    
    // Generate skill gap analysis
    const analysis = await roleRecommendationEngine.generateSkillGapAnalysis(roleTitle, userProfile.skills);
    
    return res.json(analysis);
  } catch (error) {
    console.error('Error generating skill gap analysis:', error);
    return res.status(500).json({ error: 'Error generating skill gap analysis' });
  }
});

app.get('/api/trending', async (req, res) => {
  try {
    const { industry } = req.query;
    
    // Build query
    const query = {};
    
    if (industry) {
      query.industry = industry;
    }
    
    // Find trending roles
    const trendingRoles = await Role.find(query);
    
    return res.json(trendingRoles);
  } catch (error) {
    console.error('Error retrieving trending roles:', error);
    return res.status(500).json({ error: 'Error retrieving trending roles' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'role-suggestion' });
});

// Start the server
(async () => {
  try {
    // Seed initial data
    await seedInitialData();
    
    // Start server
    app.listen(PORT, () => {
      console.log(`Role Suggestion Service running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Error starting server:', error);
  }
})();