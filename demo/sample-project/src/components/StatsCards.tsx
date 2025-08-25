import React from 'react';
import { TrendingUp, Users, FolderOpen, Zap } from 'lucide-react';

interface StatCard {
  title: string;
  value: string;
  change: string;
  changeType: 'positive' | 'negative' | 'neutral';
  icon: React.ComponentType<{ className?: string }>;
}

/**
 * StatsCards Component
 * 
 * Display key metrics in card format.
 * 🔴 BROKEN: Using mock data, needs real API integration
 * 🟡 PARTIAL: Visual layout complete, data integration missing
 */
export function StatsCards(): JSX.Element {
  // 🔵 MOCK: This data should come from an API
  const stats: StatCard[] = [
    {
      title: 'Total Projects',
      value: '24',
      change: '+12%',
      changeType: 'positive',
      icon: FolderOpen,
    },
    {
      title: 'Active Users',
      value: '1,234',
      change: '+5%',
      changeType: 'positive',
      icon: Users,
    },
    {
      title: 'Performance Score',
      value: '98.5%',
      change: '+2.1%',
      changeType: 'positive',
      icon: TrendingUp,
    },
    {
      title: 'System Uptime',
      value: '99.9%',
      change: '0%',
      changeType: 'neutral',
      icon: Zap,
    },
  ];

  const getChangeColor = (type: StatCard['changeType']): string => {
    switch (type) {
      case 'positive':
        return 'text-green-600 dark:text-green-400';
      case 'negative':
        return 'text-red-600 dark:text-red-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <div
            key={stat.title}
            className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  {stat.title}
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">
                  {stat.value}
                </p>
                <p className={`text-sm mt-1 ${getChangeColor(stat.changeType)}`}>
                  {stat.change} from last month
                </p>
              </div>
              <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                <Icon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}