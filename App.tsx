import React, { useState, useEffect } from 'react';
import { Project } from './types';
import { DEFAULT_PROJECT_SETTINGS } from './constants';
import { ProjectDashboard } from './components/ProjectDashboard';
import { ProjectEditor } from './components/ProjectEditor';
import { getAllProjectsFromDB, saveProjectToDB, deleteProjectFromDB, triggerAutoBackup, getEmergencySnapshot, clearEmergencySnapshot, initFileBackupHandle, getFileBackupStatus } from './services/storage';

// Recovery Modal — shown when IndexedDB data is lost but localStorage snapshot exists
const RecoveryModal: React.FC<{
  snapshot: { projects: any[]; meta: any };
  onRecover: () => void;
  onDismiss: () => void;
}> = ({ snapshot, onRecover, onDismiss }) => {
  const meta = snapshot.meta;
  const projectCount = snapshot.projects.length;
  const titles = meta?.projectTitles || snapshot.projects.map((p: any) => p.title);
  const savedAt = meta?.savedAt ? new Date(meta.savedAt).toLocaleString() : 'Unknown';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-neutral-900 border border-yellow-600/50 rounded-xl p-8 max-w-lg w-full mx-4 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-yellow-900/30 rounded-full flex items-center justify-center">
            <span className="text-2xl">⚠️</span>
          </div>
          <div>
            <h2 className="text-xl font-serif font-bold text-white">Data Recovery Available</h2>
            <p className="text-sm text-yellow-500">Your browser data may have been lost</p>
          </div>
        </div>

        <div className="bg-neutral-800 rounded-lg p-4 mb-6 space-y-2">
          <p className="text-sm text-neutral-300">
            We found a backup snapshot with <span className="text-white font-bold">{projectCount} project{projectCount !== 1 ? 's' : ''}</span>:
          </p>
          <ul className="text-sm text-neutral-400 space-y-1 ml-4">
            {titles.slice(0, 5).map((title: string, i: number) => (
              <li key={i} className="flex items-center gap-2">
                <span className="text-yellow-500">•</span> {title}
              </li>
            ))}
            {titles.length > 5 && (
              <li className="text-neutral-500">...and {titles.length - 5} more</li>
            )}
          </ul>
          <p className="text-xs text-neutral-500 mt-2">Snapshot from: {savedAt}</p>
          <p className="text-xs text-yellow-600 mt-1">
            ⚠️ Images will need to be re-generated (only text data is preserved in emergency snapshots)
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onRecover}
            className="flex-1 bg-yellow-600 hover:bg-yellow-500 text-black font-bold py-3 px-4 rounded-lg transition-colors"
          >
            Restore Projects
          </button>
          <button
            onClick={onDismiss}
            className="px-6 py-3 text-neutral-400 hover:text-white bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [recoveryPrompt, setRecoveryPrompt] = useState<{ projects: any[]; meta: any } | null>(null);
  const [backupStatus, setBackupStatus] = useState(() => getFileBackupStatus());

  // API Key Management
  const [apiKey, setApiKey] = useState<string>(() => {
    return process.env.API_KEY || localStorage.getItem('gemini_api_key') || '';
  });

  // Refresh backup status periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setBackupStatus(getFileBackupStatus());
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Load from IndexedDB with recovery check
  useEffect(() => {
    const loadData = async () => {
      try {
        const savedProjects = await getAllProjectsFromDB();
        if (savedProjects && savedProjects.length > 0) {
          // Check if we only have the default demo project (possible data loss)
          const isOnlyDemo = savedProjects.length === 1 && savedProjects[0].id === 'demo-1' &&
            savedProjects[0].characters.length === 0 && (savedProjects[0].scenes?.length || 0) === 0;

          // Check for emergency snapshot with real data
          const snapshot = getEmergencySnapshot();
          if (isOnlyDemo && snapshot && snapshot.projects.length > 0) {
            // We might have lost data — check if snapshot has more projects or richer data
            const snapshotHasRealData = snapshot.projects.some((p: any) =>
              p.id !== 'demo-1' || p.characters?.length > 0 || (p.scenes?.length || 0) > 0
            );
            if (snapshotHasRealData) {
              setRecoveryPrompt(snapshot);
            }
          }

          setProjects(savedProjects);
          // Trigger initial backup snapshot
          triggerAutoBackup(savedProjects);
        } else {
          // IndexedDB is completely empty — check for emergency snapshot
          const snapshot = getEmergencySnapshot();
          if (snapshot && snapshot.projects.length > 0) {
            setRecoveryPrompt(snapshot);
          }

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
    const updated = [...projects, newProject];
    setProjects(updated);
    setActiveProjectId(newProject.id);
    await saveProjectToDB(newProject);
    triggerAutoBackup(updated);
  };

  const handleDeleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = projects.filter(p => p.id !== id);
    setProjects(updated);
    if (activeProjectId === id) setActiveProjectId(null);
    await deleteProjectFromDB(id);
    triggerAutoBackup(updated);
  };

  const handleUpdateActiveProject = React.useCallback(async (updatedProject: Project) => {
    setProjects(prev => {
      const updated = prev.map(p => p.id === updatedProject.id ? updatedProject : p);
      triggerAutoBackup(updated);
      return updated;
    });
    await saveProjectToDB(updatedProject);
  }, []);

  // Recovery: restore projects from emergency snapshot
  const handleRecoverFromSnapshot = async () => {
    if (!recoveryPrompt) return;
    try {
      for (const project of recoveryPrompt.projects) {
        await saveProjectToDB(project);
      }
      const allProjects = await getAllProjectsFromDB();
      setProjects(allProjects);
      setRecoveryPrompt(null);
      clearEmergencySnapshot();
    } catch (e) {
      console.error('Recovery failed:', e);
    }
  };

  const handleDismissRecovery = () => {
    setRecoveryPrompt(null);
  };

  // File backup: let user pick a file
  const handleSetBackupFile = async () => {
    const success = await initFileBackupHandle();
    if (success) {
      setBackupStatus(getFileBackupStatus());
    }
  };

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
        <>
          {/* Recovery Modal (overlay) */}
          {recoveryPrompt && (
            <RecoveryModal
              snapshot={recoveryPrompt}
              onRecover={handleRecoverFromSnapshot}
              onDismiss={handleDismissRecovery}
            />
          )}
          <ProjectEditor
            initialProject={activeProject}
            onSave={handleUpdateActiveProject}
            onBack={() => setActiveProjectId(null)}
            backupStatus={backupStatus}
            onSetBackupFile={handleSetBackupFile}
          />
        </>
      );
    }
  }

  if (isLoading) {
    return <div className="h-screen bg-neutral-950 flex items-center justify-center text-neutral-500">Loading Studio...</div>;
  }

  // Dashboard View
  return (
    <>
      {/* Recovery Modal (overlay) */}
      {recoveryPrompt && (
        <RecoveryModal
          snapshot={recoveryPrompt}
          onRecover={handleRecoverFromSnapshot}
          onDismiss={handleDismissRecovery}
        />
      )}
      <ProjectDashboard
        projects={projects}
        onCreate={handleCreateProject}
        onSelect={setActiveProjectId}
        onDelete={handleDeleteProject}
        onRefresh={handleRefreshProjects}
        onUpdateProject={handleUpdateActiveProject}
        backupStatus={backupStatus}
        onSetBackupFile={handleSetBackupFile}
      />
    </>
  );
}
