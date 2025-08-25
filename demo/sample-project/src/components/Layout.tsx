import React, { ReactNode } from 'react';
import { Navigation } from './Navigation';
import { Header } from './Header';

interface LayoutProps {
  children: ReactNode;
}

/**
 * Layout Component
 * 
 * Provides the main layout structure for the application.
 * This component demonstrates how FF2 can orchestrate
 * parallel development of layout components.
 */
export function Layout({ children }: LayoutProps): JSX.Element {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />
      <div className="flex">
        <Navigation />
        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}