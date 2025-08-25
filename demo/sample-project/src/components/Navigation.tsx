import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  Home, 
  FolderOpen, 
  BarChart3, 
  Settings as SettingsIcon 
} from 'lucide-react';

/**
 * Navigation Component
 * 
 * Sidebar navigation for the application.
 * 🔴 INCOMPLETE: Needs mobile responsive design
 * 🟡 PARTIAL: Basic navigation working, missing hover states
 */
export function Navigation(): JSX.Element {
  const navigationItems = [
    { to: '/', icon: Home, label: 'Dashboard' },
    { to: '/projects', icon: FolderOpen, label: 'Projects' },
    { to: '/analytics', icon: BarChart3, label: 'Analytics' },
    { to: '/settings', icon: SettingsIcon, label: 'Settings' },
  ];

  return (
    <nav className="w-64 bg-white dark:bg-gray-800 shadow-lg">
      <div className="p-4">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white">
          FF2 Demo App
        </h2>
      </div>
      <ul className="mt-4">
        {navigationItems.map(({ to, icon: Icon, label }) => (
          <li key={to}>
            <NavLink
              to={to}
              className={({ isActive }) =>
                `flex items-center px-4 py-3 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 ${
                  isActive ? 'bg-blue-50 dark:bg-blue-900 text-blue-700 dark:text-blue-300' : ''
                }`
              }
            >
              <Icon className="w-5 h-5 mr-3" />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}