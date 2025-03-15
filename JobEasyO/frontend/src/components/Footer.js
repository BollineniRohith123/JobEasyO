import React from 'react';
import './Footer.css';

const Footer = () => {
  return (
    <footer className="footer">
      <div className="footer-container">
        <div className="footer-content">
          <div className="footer-section">
            <h3>JobEasyO</h3>
            <p>AI-powered job search assistant with voice interaction capabilities.</p>
          </div>
          <div className="footer-section">
            <h3>Quick Links</h3>
            <ul className="footer-links">
              <li><a href="/">Home</a></li>
              <li><a href="/profile">Profile</a></li>
              <li><a href="/job-search">Job Search</a></li>
              <li><a href="/role-suggestions">Role Suggestions</a></li>
            </ul>
          </div>
          <div className="footer-section">
            <h3>Contact</h3>
            <p>Email: support@jobeasy-o.com</p>
            <p>Phone: +1 (123) 456-7890</p>
          </div>
        </div>
        <div className="footer-bottom">
          <p>&copy; {new Date().getFullYear()} JobEasyO. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;