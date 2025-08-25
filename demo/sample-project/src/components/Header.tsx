import React from 'react';
import { Bell, Search, User } from 'lucide-react';

/**
 * Header Component
 * 
 * Application header with user actions and notifications.
 * 🟡 PARTIAL: Basic header layout, missing notification functionality
 * TODO: Add search functionality
 * TODO: Implement notification system
 */
export function Header(): JSX.Element {
  return (
    <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center space-x-4">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            ForgeFlow Demo Dashboard
          </h1>
        </div>
        
        <div className="flex items-center space-x-4">
          {/* Search - INCOMPLETE: No functionality */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search..."
              className="pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            />
          </div>
          
          {/* Notifications - INCOMPLETE: No functionality */}
          <button className="relative p-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
          </button>
          
          {/* User Menu - INCOMPLETE: No dropdown */}
          <button className="flex items-center space-x-2 p-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">
            <User className="w-5 h-5" />
            <span className="hidden md:block">Demo User</span>
          </button>
        </div>
      </div>
    </header>
  );
}