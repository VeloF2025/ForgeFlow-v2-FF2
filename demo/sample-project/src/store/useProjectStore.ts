import { create } from 'zustand';

interface Project {
  id: string;
  name: string;
  status: 'active' | 'completed' | 'paused';
  progress: number;
  createdAt: Date;
  updatedAt: Date;
}

interface ProjectStore {
  projects: Project[];
  loading: boolean;
  error: string | null;
  
  // Actions
  fetchProjects: () => Promise<void>;
  addProject: (project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  deleteProject: (id: string) => void;
}

/**
 * Project Store using Zustand
 * 
 * Manages project state across the application.
 * 🔴 BROKEN: fetchProjects uses mock data instead of real API
 * 🟡 PARTIAL: CRUD operations implemented but not connected to backend
 * TODO: Integrate with real API endpoints
 * TODO: Add error handling for network requests
 * TODO: Implement optimistic updates
 */
export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  loading: false,
  error: null,

  fetchProjects: async () => {
    set({ loading: true, error: null });
    
    try {
      // 🔴 BROKEN: This should be a real API call
      // const response = await fetch('/api/projects');
      // const projects = await response.json();
      
      // 🔵 MOCK: Using mock data for demonstration
      const mockProjects: Project[] = [
        {
          id: '1',
          name: 'E-commerce Platform',
          status: 'active',
          progress: 75,
          createdAt: new Date('2024-01-15'),
          updatedAt: new Date('2024-01-20'),
        },
        {
          id: '2',
          name: 'Mobile App Redesign',
          status: 'active',
          progress: 45,
          createdAt: new Date('2024-01-10'),
          updatedAt: new Date('2024-01-18'),
        },
        {
          id: '3',
          name: 'API Documentation',
          status: 'completed',
          progress: 100,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-15'),
        },
      ];

      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 800));
      
      set({ projects: mockProjects, loading: false });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to fetch projects',
        loading: false 
      });
    }
  },

  addProject: (projectData) => {
    const newProject: Project = {
      ...projectData,
      id: Math.random().toString(36).substr(2, 9),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    set(state => ({
      projects: [...state.projects, newProject]
    }));

    // TODO: Send to API
    // fetch('/api/projects', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(newProject),
    // });
  },

  updateProject: (id, updates) => {
    set(state => ({
      projects: state.projects.map(project =>
        project.id === id
          ? { ...project, ...updates, updatedAt: new Date() }
          : project
      )
    }));

    // TODO: Send to API
    // fetch(`/api/projects/${id}`, {
    //   method: 'PATCH',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(updates),
    // });
  },

  deleteProject: (id) => {
    set(state => ({
      projects: state.projects.filter(project => project.id !== id)
    }));

    // TODO: Send to API
    // fetch(`/api/projects/${id}`, { method: 'DELETE' });
  },
}));