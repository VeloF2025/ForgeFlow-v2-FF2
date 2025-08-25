import React from 'react';
import { StatsCards } from '../components/StatsCards';
import { RecentActivity } from '../components/RecentActivity';
import { ProjectOverview } from '../components/ProjectOverview';

/**
 * Dashboard Page Component
 * 
 * Main dashboard showing project statistics and recent activity.
 * This page demonstrates how FF2 can orchestrate parallel development
 * of dashboard components.
 * 
 * 🟡 PARTIAL: Basic layout, missing real data integration
 * TODO: Connect to real API endpoints
 * TODO: Add real-time updates
 * TODO: Implement data refresh functionality
 */
export function Dashboard(): JSX.Element {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Dashboard
        </h1>
        <p className="text-gray-600 dark:text-gray-300 mt-1">
          Welcome to the ForgeFlow v2 demonstration dashboard
        </p>
      </div>

      {/* Stats Overview */}
      <StatsCards />

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Project Overview */}
        <div className="lg:col-span-2">
          <ProjectOverview />
        </div>

        {/* Recent Activity */}
        <div>
          <RecentActivity />
        </div>
      </div>
    </div>
  );
}