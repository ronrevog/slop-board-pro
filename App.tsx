
import React, { useState, useEffect } from 'react';
import { Project } from './types';
import { DEFAULT_PROJECT_SETTINGS } from './constants';
import { ProjectDashboard } from './components/ProjectDashboard';
import { ProjectEditor } from './components/ProjectEditor';
import { getAllProjectsFromDB, saveProjectToDB, deleteProjectFromDB } from './services/storage';

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load from IndexedDB
  useEffect(() => {
    const loadData = async () => {
      try {
        const savedProjects = await getAllProjectsFromDB();
        if (savedProjects && savedProjects.length > 0) {
          setProjects(savedProjects);
        } else {
          // Init with default demo project if empty
          const demoProject: Project = {
              id: 'demo-1',
              title: 'Untitled Sequence',
              scriptContent: '',
              settings: DEFAULT_PROJECT_SETTINGS,
              characters: [],
              locations: [],
              shots: []
          };
          setProjects([demoProject]);
          await saveProjectToDB(demoProject);
        }
      } catch (e) {
        console.error("Failed to load projects", e);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  const handleCreateProject = async () => {
    const newProject: Project = {
        id: crypto.randomUUID(),
        title: 'New Project ' + (projects.length + 1),
        scriptContent: '',
        settings: DEFAULT_PROJECT_SETTINGS,
        characters: [],
        locations: [],
        shots: []
    };
    setProjects(prev => [...prev, newProject]);
    setActiveProjectId(newProject.id);
    await saveProjectToDB(newProject);
  };

  const handleDeleteProject = async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setProjects(prev => prev.filter(p => p.id !== id));
      if (activeProjectId === id) setActiveProjectId(null);
      await deleteProjectFromDB(id);
  };

  const handleUpdateActiveProject = async (updatedProject: Project) => {
      setProjects(prev => prev.map(p => p.id === updatedProject.id ? updatedProject : p));
      await saveProjectToDB(updatedProject);
  };

  if (!process.env.API_KEY) {
    return (
      <div className="h-screen flex items-center justify-center bg-black text-white p-8 text-center">
        <div>
           <h1 className="text-4xl font-serif text-red-600 mb-4">Slop Board</h1>
           <p className="text-neutral-400">Missing API Key. Please run with a valid API_KEY environment variable.</p>
        </div>
      </div>
    );
  }

  // Active Project View (Editor)
  if (activeProjectId) {
      const activeProject = projects.find(p => p.id === activeProjectId);
      if (activeProject) {
          return (
              <ProjectEditor 
                initialProject={activeProject}
                onSave={handleUpdateActiveProject}
                onBack={() => setActiveProjectId(null)}
              />
          );
      }
  }

  if (isLoading) {
    return <div className="h-screen bg-neutral-950 flex items-center justify-center text-neutral-500">Loading Studio...</div>;
  }

  // Dashboard View
  return (
    <ProjectDashboard 
        projects={projects}
        onCreate={handleCreateProject}
        onSelect={setActiveProjectId}
        onDelete={handleDeleteProject}
    />
  );
}
