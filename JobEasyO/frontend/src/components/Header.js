import React from 'react';
import { Link } from 'react-router-dom';
import './Header.css';

const Header = () => {
  return (
    <header className="header">
      <div className="header-container">
        <div className="logo">
          <Link to="/">
            <h1>JobEasyO</h1>
          </Link>
        </div>
        <nav className="nav">
          <ul className="nav-list">
            <li className="nav-item">
              <Link to="/" className="nav-link">Home</Link>
            </li>
            <li className="nav-item">
              <Link to="/profile" className="nav-link">Profile</Link>
            </li>
            <li className="nav-item">
              <Link to="/job-search" className="nav-link">Job Search</Link>
            </li>
            <li className="nav-item">
              <Link to="/role-suggestions" className="nav-link">Role Suggestions</Link>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
};

export default Header;