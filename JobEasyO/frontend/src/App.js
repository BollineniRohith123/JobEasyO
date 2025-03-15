import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './App.css';

// Import pages
import Home from './pages/Home';
import Profile from './pages/Profile';
import JobSearch from './pages/JobSearch';
import RoleSuggestions from './pages/RoleSuggestions';

// Import components
import Header from './components/Header';
import Footer from './components/Footer';

function App() {
  return (
    <Router>
      <div className="app">
        <Header />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/job-search" element={<JobSearch />} />
            <Route path="/role-suggestions" element={<RoleSuggestions />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </Router>
  );
}

export default App;