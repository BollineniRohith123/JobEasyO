require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const { NlpManager } = require('node-nlp');
const { Voice } = require('elevenlabs-node');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3001;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || 'your-api-key';

// Initialize ElevenLabs Voice API
const voice = new Voice(ELEVENLABS_API_KEY);

// Initialize NLP Manager
const nlpManager = new NlpManager({ languages: ['en'] });

// Train NLP model with job search related intents
const trainNlpModel = async () => {
  // Intent: Greeting
  nlpManager.addDocument('en', 'hello', 'greeting');
  nlpManager.addDocument('en', 'hi there', 'greeting');
  nlpManager.addDocument('en', 'hey', 'greeting');
  nlpManager.addDocument('en', 'good morning', 'greeting');
  nlpManager.addDocument('en', 'good afternoon', 'greeting');
  
  // Intent: Job Search
  nlpManager.addDocument('en', 'I need a job', 'job.search');
  nlpManager.addDocument('en', 'I am looking for a job', 'job.search');
  nlpManager.addDocument('en', 'help me find a job', 'job.search');
  nlpManager.addDocument('en', 'find me a job', 'job.search');
  
  // Intent: Provide Role
  nlpManager.addDocument('en', 'I am a software developer', 'provide.role');
  nlpManager.addDocument('en', 'I work as a data scientist', 'provide.role');
  nlpManager.addDocument('en', 'my role is project manager', 'provide.role');
  nlpManager.addDocument('en', 'I am looking for a position as a designer', 'provide.role');
  
  // Intent: Provide Experience
  nlpManager.addDocument('en', 'I have 5 years of experience', 'provide.experience');
  nlpManager.addDocument('en', 'I have been working for 3 years', 'provide.experience');
  nlpManager.addDocument('en', 'I am a fresher', 'provide.experience');
  nlpManager.addDocument('en', 'I have no experience', 'provide.experience');
  
  // Intent: Provide Skills
  nlpManager.addDocument('en', 'I know JavaScript', 'provide.skills');
  nlpManager.addDocument('en', 'I am skilled in Python', 'provide.skills');
  nlpManager.addDocument('en', 'my skills include React and Node.js', 'provide.skills');
  nlpManager.addDocument('en', 'I am good at project management', 'provide.skills');
  
  // Intent: Provide Location
  nlpManager.addDocument('en', 'I am in New York', 'provide.location');
  nlpManager.addDocument('en', 'I live in San Francisco', 'provide.location');
  nlpManager.addDocument('en', 'I want to work in London', 'provide.location');
  nlpManager.addDocument('en', 'I am looking for remote jobs', 'provide.location');
  
  // Intent: Provide Preferences
  nlpManager.addDocument('en', 'I prefer remote work', 'provide.preferences');
  nlpManager.addDocument('en', 'I am looking for full-time positions', 'provide.preferences');
  nlpManager.addDocument('en', 'I want a contract job', 'provide.preferences');
  nlpManager.addDocument('en', 'I am interested in freelance work', 'provide.preferences');
  
  // Add responses
  nlpManager.addAnswer('en', 'greeting', 'Hello! I am your job search assistant. How can I help you today?');
  nlpManager.addAnswer('en', 'job.search', 'I can help you find a job. Let\'s start by gathering some information about your preferences. What role are you looking for?');
  nlpManager.addAnswer('en', 'provide.role', 'Great! How many years of experience do you have in this role?');
  nlpManager.addAnswer('en', 'provide.experience', 'Thank you. What skills do you have that are relevant to this role?');
  nlpManager.addAnswer('en', 'provide.skills', 'Excellent! Where are you looking to work? Please specify a location or if you prefer remote work.');
  nlpManager.addAnswer('en', 'provide.location', 'Got it. Do you have any other preferences like full-time, contract, or freelance work?');
  nlpManager.addAnswer('en', 'provide.preferences', 'Thank you for providing your preferences. I will now search for jobs that match your criteria.');
  
  // Train the model
  await nlpManager.train();
  console.log('NLP model trained successfully');
};

// Middleware
app.use(cors());
app.use(express.json());

// Socket.io connection
io.on('connection', (socket) => {
  console.log('Client connected');
  
  // Handle speech recognition results
  socket.on('speech', async (data) => {
    try {
      // Process the speech input
      const { text } = data;
      console.log('Received speech:', text);
      
      // Process with NLP
      const result = await nlpManager.process('en', text);
      console.log('NLP result:', result);
      
      // Generate response
      const response = result.answer || 'I didn\'t understand that. Can you please rephrase?';
      
      // Convert response to speech using ElevenLabs
      try {
        const voiceId = 'EXAVITQu4vr4xnSDxMaL'; // Default voice ID
        const audioData = await voice.textToSpeech(voiceId, {
          text: response,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.5
          }
        });
        
        // Send the audio response back to the client
        socket.emit('speech_response', {
          text: response,
          audio: audioData
        });
      } catch (error) {
        console.error('Error generating speech:', error);
        // Fallback to text response if speech generation fails
        socket.emit('speech_response', {
          text: response,
          error: 'Speech generation failed'
        });
      }
    } catch (error) {
      console.error('Error processing speech:', error);
      socket.emit('error', { message: 'Error processing speech' });
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// API endpoints
app.post('/api/process', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }
    
    // Process with NLP
    const result = await nlpManager.process('en', text);
    
    // Generate response
    const response = result.answer || 'I didn\'t understand that. Can you please rephrase?';
    
    return res.json({
      intent: result.intent,
      confidence: result.score,
      response
    });
  } catch (error) {
    console.error('Error processing text:', error);
    return res.status(500).json({ error: 'Error processing text' });
  }
});

app.post('/api/synthesize', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }
    
    // Convert text to speech using ElevenLabs
    const voiceId = 'EXAVITQu4vr4xnSDxMaL'; // Default voice ID
    const audioData = await voice.textToSpeech(voiceId, {
      text,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.5
      }
    });
    
    // Set appropriate headers
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', 'attachment; filename="speech.mp3"');
    
    // Send the audio data
    return res.send(audioData);
  } catch (error) {
    console.error('Error synthesizing speech:', error);
    return res.status(500).json({ error: 'Error synthesizing speech' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'voice-interaction' });
});

// Start the server
(async () => {
  try {
    // Train NLP model
    await trainNlpModel();
    
    // Start server
    server.listen(PORT, () => {
      console.log(`Voice Interaction Service running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Error starting server:', error);
  }
})();