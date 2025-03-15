import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './VoiceInteraction.css';

const VoiceInteraction = ({ onConversationUpdate }) => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [partialTranscript, setPartialTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [conversation, setConversation] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
  
  const socketRef = useRef(null);
  const recognitionRef = useRef(null);
  
  // Initialize socket connection
  useEffect(() => {
    // Connect to Voice Interaction Service
    socketRef.current = io('http://localhost:3001');
    
    socketRef.current.on('connect', () => {
      setIsConnected(true);
      setError(null);
    });
    
    socketRef.current.on('disconnect', () => {
      setIsConnected(false);
    });
    
    socketRef.current.on('speech_response', (data) => {
      setResponse(data.text);
      
      // Add response to conversation
      setConversation(prev => [
        ...prev,
        { sender: 'system', text: data.text }
      ]);
      
      // Play audio if available
      if (data.audio) {
        const audio = new Audio(`data:audio/mpeg;base64,${data.audio}`);
        audio.play();
      }
      
      // Notify parent component
      if (onConversationUpdate) {
        onConversationUpdate([
          ...conversation,
          { sender: 'system', text: data.text }
        ]);
      }
    });
    
    socketRef.current.on('error', (data) => {
      setError(data.message);
    });
    
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [conversation, onConversationUpdate]);
  
  // Initialize speech recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';
      
      recognitionRef.current.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }
        
        if (finalTranscript) {
          setTranscript(finalTranscript);
          setPartialTranscript('');
          
          // Add user input to conversation
          setConversation(prev => [
            ...prev,
            { sender: 'user', text: finalTranscript }
          ]);
          
          // Send to server
          if (socketRef.current) {
            socketRef.current.emit('speech', { text: finalTranscript });
          }
          
          // Notify parent component
          if (onConversationUpdate) {
            onConversationUpdate([
              ...conversation,
              { sender: 'user', text: finalTranscript }
            ]);
          }
        } else {
          setPartialTranscript(interimTranscript);
        }
      };
      
      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error', event.error);
        setError(`Speech recognition error: ${event.error}`);
        setIsListening(false);
      };
      
      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    } else {
      setError('Speech recognition is not supported in this browser.');
    }
    
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [conversation, onConversationUpdate]);
  
  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
        setError(null);
      } catch (error) {
        console.error('Error starting speech recognition:', error);
        setError(`Error starting speech recognition: ${error.message}`);
      }
    }
  };
  
  const handleTextSubmit = (e) => {
    e.preventDefault();
    
    if (!transcript.trim()) return;
    
    // Add user input to conversation
    setConversation(prev => [
      ...prev,
      { sender: 'user', text: transcript }
    ]);
    
    // Send to server
    if (socketRef.current) {
      socketRef.current.emit('speech', { text: transcript });
    }
    
    // Notify parent component
    if (onConversationUpdate) {
      onConversationUpdate([
        ...conversation,
        { sender: 'user', text: transcript }
      ]);
    }
    
    // Clear input
    setTranscript('');
  };
  
  return (
    <div className="voice-interaction">
      <div className="voice-status">
        {isConnected ? (
          <span className="status-connected">Connected</span>
        ) : (
          <span className="status-disconnected">Disconnected</span>
        )}
      </div>
      
      <div className="conversation-container">
        {conversation.map((message, index) => (
          <div 
            key={index}
            className={`message ${message.sender === 'user' ? 'user-message' : 'system-message'}`}
          >
            <div className="message-sender">{message.sender === 'user' ? 'You' : 'Assistant'}</div>
            <div className="message-text">{message.text}</div>
          </div>
        ))}
      </div>
      
      <div className="voice-controls">
        <button 
          className={`voice-button ${isListening ? 'listening' : ''}`}
          onClick={toggleListening}
        >
          {isListening ? 'Stop Listening' : 'Start Listening'}
        </button>
        
        <form onSubmit={handleTextSubmit} className="text-input-form">
          <input
            type="text"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Type your message..."
            className="text-input"
          />
          <button type="submit" className="send-button">Send</button>
        </form>
      </div>
      
      {partialTranscript && (
        <div className="partial-transcript">{partialTranscript}</div>
      )}
      
      {error && (
        <div className="error-message">{error}</div>
      )}
    </div>
  );
};

export default VoiceInteraction;