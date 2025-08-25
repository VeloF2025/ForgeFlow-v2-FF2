import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Projects } from './pages/Projects';
import { Analytics } from './pages/Analytics';
import { Settings } from './pages/Settings';

/**
 * Main Application Component
 * 
 * This serves as the root component for the FF2 demo application.
 * It demonstrates a typical React application structure that FF2
 * can orchestrate parallel development on.
 */
function App(): JSX.Element {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;