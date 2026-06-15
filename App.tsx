import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { Project } from './types';
import { DEFAULT_PROJECT_SETTINGS } from './constants';
import { ProjectDashboard } from './components/ProjectDashboard';
import { ProjectEditor } from './components/ProjectEditor';
import { AuthGate } from './components/AuthGate';
import {
  getAllProjectsFromDB,
  saveProjectToDB,
  deleteProjectFromDB,
  triggerAutoBackup,
  getEmergencySnapshot,
  clearEmergencySnapshot,
  initFileBackupHandle,
  getFileBackupStatus,
} from './services/storage';
import { onAuthChange, signOut } from './services/firebaseAuth';
import {
  loadProjectsFromCloud,
  scheduleCloudSync,
  deleteProjectFromCloud,
  syncAllProjectsToCloud,
} from './services/firebaseSync';

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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="glass-panel-heavy border-yellow-600/35 rounded-2xl p-8 max-w-lg w-full mx-4 shadow-2xl animate-fade-in-up relative overflow-hidden">
        {/* Subtle ambient amber pulse behind the icon */}
        <div className="absolute -top-16 -left-16 w-36 h-36 bg-yellow-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex items-center gap-3 mb-6 relative z-10">
          <div className="w-12 h-12 bg-yellow-950/30 rounded-full flex items-center justify-center ring-1 ring-yellow-500/20">
            <span className="text-xl">⚠️</span>
          </div>
          <div>
            <h2 className="text-xl font-serif font-bold text-white tracking-wide">Data Recovery Available</h2>
            <p className="text-xs text-yellow-400 font-medium uppercase tracking-wider mt-0.5">System Restore Protocol</p>
          </div>
        </div>

        <div className="bg-neutral-950/40 border border-neutral-900 rounded-xl p-5 mb-6 space-y-3 relative z-10">
          <p className="text-sm text-neutral-300">
            We discovered a browser backup snapshot containing <span className="text-yellow-400 font-bold">{projectCount} project{projectCount !== 1 ? 's' : ''}</span>:
          </p>
          <ul className="text-xs text-neutral-400 space-y-2 pl-2">
            {titles.slice(0, 5).map((title: string, i: number) => (
              <li key={i} className="flex items-center gap-2">
                <span className="text-yellow-500/60">•</span> <span className="text-neutral-200 font-medium">{title}</span>
              </li>
            ))}
            {titles.length > 5 && (
              <li className="text-neutral-500 pl-4 font-semibold">...and {titles.length - 5} more</li>
            )}
          </ul>
          <div className="border-t border-neutral-800/40 pt-3 mt-2 flex flex-col gap-1 text-[11px] text-neutral-500">
            <span>Snapshot timestamp: {savedAt}</span>
            <span className="text-yellow-600/90 font-medium">
              ⚠️ Note: Only text assets are recoverable. Generated images will require regeneration.
            </span>
          </div>
        </div>

        <div className="flex gap-3 relative z-10">
          <button
            onClick={onRecover}
            className="flex-1 bg-yellow-600 hover:bg-yellow-500 text-black font-semibold py-2.5 px-4 rounded-lg shadow-lg shadow-yellow-950/40 hover:shadow-yellow-600/10 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300"
          >
            Restore Projects
          </button>
          <button
            onClick={onDismiss}
            className="px-6 py-2.5 text-neutral-400 hover:text-white glass-panel hover:bg-neutral-800/30 rounded-lg hover:scale-[1.02] active:scale-[0.98] transition-all duration-300"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};

// Migration Modal — shown when user logs in for first time with existing local projects
const MigrationModal: React.FC<{
  localCount: number;
  cloudCount: number;
  onMigrate: () => void;
  onSkip: () => void;
  isMigrating: boolean;
}> = ({ localCount, cloudCount, onMigrate, onSkip, isMigrating }) => (
  <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md animate-fade-in">
    <div className="glass-panel-heavy border-blue-600/35 rounded-2xl p-8 max-w-lg w-full mx-4 shadow-2xl animate-fade-in-up relative overflow-hidden">
      {/* Ambient blue pulse glow */}
      <div className="absolute -top-16 -left-16 w-36 h-36 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="flex items-center gap-3 mb-6 relative z-10">
        <div className="w-12 h-12 bg-blue-950/30 rounded-full flex items-center justify-center ring-1 ring-blue-500/20">
          <span className="text-xl">☁️</span>
        </div>
        <div>
          <h2 className="text-xl font-serif font-bold text-white tracking-wide">Upload to Cloud?</h2>
          <p className="text-xs text-blue-400 font-medium uppercase tracking-wider mt-0.5">Cloud Integration protocol</p>
        </div>
      </div>

      <div className="bg-neutral-950/40 border border-neutral-900 rounded-xl p-5 mb-6 space-y-3 relative z-10">
        <p className="text-sm text-neutral-300">
          You have <span className="text-blue-400 font-bold">{localCount} local project{localCount !== 1 ? 's' : ''}</span> in this browser
          {cloudCount > 0 && <> and <span className="text-white font-bold">{cloudCount}</span> already in the cloud</>}.
        </p>
        <p className="text-sm text-neutral-400 leading-relaxed">
          Would you like to sync and securely back up these local projects to your cloud account? This ensures you can access them from any editing bay.
        </p>
      </div>

      <div className="flex gap-3 relative z-10">
        <button
          onClick={onMigrate}
          disabled={isMigrating}
          className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2.5 px-4 rounded-lg shadow-lg shadow-blue-950/40 hover:shadow-blue-600/10 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 disabled:opacity-50"
        >
          {isMigrating ? (
            <span className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Syncing Projects...
            </span>
          ) : (
            'Sync to Cloud'
          )}
        </button>
        <button
          onClick={onSkip}
          disabled={isMigrating}
          className="px-6 py-2.5 text-neutral-400 hover:text-white glass-panel hover:bg-neutral-800/30 rounded-lg hover:scale-[1.02] active:scale-[0.98] transition-all duration-300"
        >
          Skip
        </button>
      </div>
    </div>
  </div>
);


export default function App() {
  // ---- Auth State ----
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // ---- Project State ----
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [recoveryPrompt, setRecoveryPrompt] = useState<{ projects: any[]; meta: any } | null>(null);
  const [backupStatus, setBackupStatus] = useState(() => getFileBackupStatus());

  // ---- Migration State ----
  const [showMigration, setShowMigration] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationLocalCount, setMigrationLocalCount] = useState(0);
  const [migrationCloudCount, setMigrationCloudCount] = useState(0);

  // API Key Management
  const [apiKey, setApiKey] = useState<string>(() => {
    return process.env.API_KEY || localStorage.getItem('gemini_api_key') || '';
  });

  // ---- Firebase Auth Listener ----
  useEffect(() => {
    const unsubscribe = onAuthChange((user) => {
      setAuthUser(user);
      setAuthLoading(false);
    });
    return unsubscribe;
  }, []);

  // Refresh backup status periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setBackupStatus(getFileBackupStatus());
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // ---- Load Projects (hybrid: cloud + local) ----
  useEffect(() => {
    if (authLoading || !authUser) return;

    const loadData = async () => {
      setIsLoading(true);
      try {
        // Try loading from cloud first
        const cloudProjects = await loadProjectsFromCloud();
        const localProjects = await getAllProjectsFromDB();

        if (cloudProjects.length > 0) {
          // Use cloud projects as source of truth
          setProjects(cloudProjects);

          // Also save cloud projects to local IndexedDB for offline access.
          // Run saves in parallel — each is an independent IndexedDB put.
          await Promise.all(cloudProjects.map(saveProjectToDB));
          triggerAutoBackup(cloudProjects);

          // Check if there are local-only projects that aren't in the cloud
          const cloudIds = new Set(cloudProjects.map(p => p.id));
          const localOnlyProjects = localProjects.filter(
            p => !cloudIds.has(p.id) && p.id !== 'demo-1'
          );
          if (localOnlyProjects.length > 0) {
            setMigrationLocalCount(localOnlyProjects.length);
            setMigrationCloudCount(cloudProjects.length);
            setShowMigration(true);
          }
        } else if (localProjects.length > 0) {
          // No cloud data — check if local data should be migrated
          const hasRealData = localProjects.some(
            p => p.id !== 'demo-1' || p.characters.length > 0 || (p.scenes?.length || 0) > 0
          );

          setProjects(localProjects);
          triggerAutoBackup(localProjects);

          if (hasRealData) {
            setMigrationLocalCount(localProjects.length);
            setMigrationCloudCount(0);
            setShowMigration(true);
          }
        } else {
          // Nothing anywhere — check emergency snapshot
          const snapshot = getEmergencySnapshot();
          if (snapshot && snapshot.projects.length > 0) {
            setRecoveryPrompt(snapshot);
          }

          // Init with default demo project
          const demoProject: Project = {
            id: 'demo-1',
            title: 'Untitled Sequence',
            scriptContent: '',
            settings: DEFAULT_PROJECT_SETTINGS,
            characters: [],
            locations: [],
            shots: [],
            scenes: [],
          };
          setProjects([demoProject]);
          await saveProjectToDB(demoProject);
        }
      } catch (e) {
        console.error('Failed to load projects', e);
        // Fall back to local
        try {
          const localProjects = await getAllProjectsFromDB();
          if (localProjects.length > 0) {
            setProjects(localProjects);
          }
        } catch (e2) {
          console.error('Local fallback also failed', e2);
        }
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [authUser, authLoading]);

  // ---- Handlers ----

  const handleCreateProject = async () => {
    const newProject: Project = {
      id: crypto.randomUUID(),
      title: 'New Project ' + (projects.length + 1),
      scriptContent: '',
      settings: DEFAULT_PROJECT_SETTINGS,
      characters: [],
      locations: [],
      shots: [],
      scenes: [],
    };
    const updated = [...projects, newProject];
    setProjects(updated);
    setActiveProjectId(newProject.id);
    await saveProjectToDB(newProject);
    triggerAutoBackup(updated);
    scheduleCloudSync(newProject); // ← Cloud sync
  };

  const handleDeleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = projects.filter(p => p.id !== id);
    setProjects(updated);
    if (activeProjectId === id) setActiveProjectId(null);
    await deleteProjectFromDB(id);
    triggerAutoBackup(updated);
    deleteProjectFromCloud(id); // ← Cloud delete
  };

  const handleUpdateActiveProject = React.useCallback(async (updatedProject: Project) => {
    setProjects(prev => {
      const updated = prev.map(p => p.id === updatedProject.id ? updatedProject : p);
      triggerAutoBackup(updated);
      return updated;
    });
    await saveProjectToDB(updatedProject);
    scheduleCloudSync(updatedProject); // ← Cloud sync (debounced)
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
      console.error('Failed to refresh projects', e);
    }
  };

  // Migration: upload local projects to cloud
  const handleMigrate = async () => {
    setIsMigrating(true);
    try {
      const localProjects = await getAllProjectsFromDB();
      await syncAllProjectsToCloud(localProjects);
      // Reload from cloud to get the URL-ified versions
      const cloudProjects = await loadProjectsFromCloud();
      if (cloudProjects.length > 0) {
        setProjects(cloudProjects);
        // Parallel IndexedDB writes — each project is independent.
        await Promise.all(cloudProjects.map(saveProjectToDB));
      }
      setShowMigration(false);
    } catch (e) {
      console.error('Migration failed:', e);
    } finally {
      setIsMigrating(false);
    }
  };

  // Sign out handler
  const handleSignOut = async () => {
    await signOut();
    setProjects([]);
    setActiveProjectId(null);
  };

  // ---- Render ----

  // Auth loading spinner
  if (authLoading) {
    return (
      <div className="h-screen bg-neutral-950 flex items-center justify-center text-neutral-500">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 border-2 border-neutral-700 border-t-neutral-400 rounded-full animate-spin" />
          Loading...
        </div>
      </div>
    );
  }

  // Not signed in → show login
  if (!authUser) {
    return <AuthGate onSignedIn={() => { /* onAuthChange will update state */ }} />;
  }

  // Signed in but no API key → prompt for Gemini key
  if (!apiKey) {
    return (
      <div className="h-screen flex items-center justify-center bg-radial-cinematic text-white p-8 text-center animate-fade-in">
        <div className="w-full max-w-md glass-panel-heavy p-8 md:p-10 rounded-2xl shadow-2xl relative overflow-hidden animate-fade-in-up">
          {/* Crimson ambient glow behind logo */}
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-48 h-48 bg-red-600/10 rounded-full blur-3xl pointer-events-none" />

          {/* User info bar */}
          <div className="flex items-center justify-center gap-3 mb-8 bg-neutral-950/40 py-2 px-4 rounded-full border border-neutral-900/60 max-w-xs mx-auto z-10 relative">
            {authUser.photoURL && (
              <img src={authUser.photoURL} alt="" className="w-6 h-6 rounded-full ring-1 ring-neutral-800" referrerPolicy="no-referrer" />
            )}
            <span className="text-xs text-neutral-400 truncate max-w-[140px]">{authUser.displayName || authUser.email}</span>
            <button 
              onClick={handleSignOut} 
              className="text-xs text-neutral-500 hover:text-red-500 transition-colors ml-2 pl-2 border-l border-neutral-800/80 font-medium"
            >
              Sign out
            </button>
          </div>

          <div className="relative z-10 space-y-6">
            <div className="space-y-2">
              <img 
                src="/img/slopboard_logo_text.png" 
                alt="Slop Board" 
                className="h-10 w-auto mx-auto filter drop-shadow-[0_0_12px_rgba(239,68,68,0.25)] animate-glow-pulse" 
              />
              <p className="text-neutral-500 uppercase tracking-widest text-[10px] font-semibold">Cinematic Script & Storyboard Engine</p>
            </div>
            
            <p className="text-sm text-neutral-400 leading-relaxed px-2">
              Enter your <span className="text-neutral-200 font-semibold">Google Gemini API Key</span> to power the real-time AI storyboard generation.
            </p>

            <form onSubmit={handleSaveApiKey} className="space-y-4 pt-2">
              <input
                type="password"
                name="apiKey"
                className="w-full glass-input px-4 py-3 rounded-lg text-white mb-2 text-center tracking-widest placeholder:tracking-normal placeholder:text-neutral-600 focus:outline-none text-sm"
                placeholder="AIzaSy..."
                autoFocus
              />
              <button
                type="submit"
                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-lg shadow-lg shadow-red-950/50 hover:shadow-red-700/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300"
              >
                Start Creative Studio
              </button>
            </form>
            
            <div className="pt-2 border-t border-neutral-900/80">
              <p className="text-[11px] text-neutral-500 leading-relaxed">
                Your API key is stored safely and locally inside your browser's private storage. 
                <br />
                Get a free key from the <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" className="text-red-500/80 hover:text-red-400 underline transition-colors">Google AI Studio</a>.
              </p>
            </div>
          </div>
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
          {/* Migration Modal (overlay) */}
          {showMigration && (
            <MigrationModal
              localCount={migrationLocalCount}
              cloudCount={migrationCloudCount}
              onMigrate={handleMigrate}
              onSkip={() => setShowMigration(false)}
              isMigrating={isMigrating}
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
    return (
      <div className="h-screen bg-neutral-950 flex items-center justify-center text-neutral-500">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 border-2 border-neutral-700 border-t-neutral-400 rounded-full animate-spin" />
          Loading projects...
        </div>
      </div>
    );
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
      {/* Migration Modal (overlay) */}
      {showMigration && (
        <MigrationModal
          localCount={migrationLocalCount}
          cloudCount={migrationCloudCount}
          onMigrate={handleMigrate}
          onSkip={() => setShowMigration(false)}
          isMigrating={isMigrating}
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
        authUser={authUser}
        onSignOut={handleSignOut}
      />
    </>
  );
}
