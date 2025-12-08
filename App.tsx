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

  // API Key Management
  const [apiKey, setApiKey] = useState<string>(() => {
    return process.env.API_KEY || localStorage.getItem('gemini_api_key') || '';
  });

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
            shots: [],
            scenes: []
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
      shots: [],
      scenes: []
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

  const handleUpdateActiveProject = React.useCallback(async (updatedProject: Project) => {
    setProjects(prev => prev.map(p => p.id === updatedProject.id ? updatedProject : p));
    await saveProjectToDB(updatedProject);
  }, []);

  const handleSaveApiKey = (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const input = form.elements.namedItem('apiKey') as HTMLInputElement;
    const key = input.value.trim();
    if (key) {
      localStorage.setItem('gemini_api_key', key);
      setApiKey(key);
    }
  };

  // Refresh projects from DB (for after import)
  const handleRefreshProjects = async () => {
    try {
      const savedProjects = await getAllProjectsFromDB();
      setProjects(savedProjects || []);
    } catch (e) {
      console.error("Failed to refresh projects", e);
    }
  };

  if (!apiKey) {
    return (
      <div className="h-screen flex items-center justify-center bg-black text-white p-8 text-center">
        <div className="w-full max-w-md">
          <h1 className="text-4xl font-serif text-red-600 mb-4">Slop Board</h1>
          <p className="text-neutral-400 mb-6">Enter your Google Gemini API Key to continue</p>
          <form onSubmit={handleSaveApiKey}>
            <input
              type="password"
              name="apiKey"
              className="w-full bg-neutral-900 border border-neutral-800 rounded px-4 py-2 text-white mb-4 focus:outline-none focus:border-red-600"
              placeholder="AIzaSy..."
              autoFocus
            />
            <button
              type="submit"
              className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded transition-colors"
            >
              Start Creative Studio
            </button>
          </form>
          <p className="text-xs text-neutral-600 mt-4">Key is saved locally in your browser. Get a key from Google AI Studio.</p>
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
      onRefresh={handleRefreshProjects}
    />
  );
}
