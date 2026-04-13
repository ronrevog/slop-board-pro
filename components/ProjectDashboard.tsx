
import React, { useRef, useState } from 'react';
import { User } from 'firebase/auth';
import { Project } from '../types';
import { Plus, Film, Trash2, Calendar, Clapperboard, LayoutGrid, Download, Upload, CheckCircle, AlertCircle, ImagePlus, HardDrive, Shield, LogOut } from 'lucide-react';
import { Button } from './Button';
import { exportProjectsToFile, importProjectsFromFile, exportSingleProjectToFile } from '../services/storage';

interface BackupStatus {
  isActive: boolean;
  lastBackupTime: number | null;
  error: string | null;
  isSupported: boolean;
}

interface ProjectDashboardProps {
  projects: Project[];
  onCreate: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onRefresh: () => void;
  onUpdateProject: (project: Project) => void;
  backupStatus?: BackupStatus;
  onSetBackupFile?: () => void;
  authUser?: User | null;
  onSignOut?: () => void;
}

export const ProjectDashboard: React.FC<ProjectDashboardProps> = ({
  projects,
  onCreate,
  onSelect,
  onDelete,
  onRefresh,
  onUpdateProject,
  backupStatus,
  onSetBackupFile,
  authUser,
  onSignOut,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [uploadingCoverForProjectId, setUploadingCoverForProjectId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleExport = async () => {
    try {
      const count = await exportProjectsToFile();
      showNotification('success', `Exported ${count} project${count !== 1 ? 's' : ''} successfully!`);
    } catch (err) {
      showNotification('error', 'Failed to export projects');
      console.error(err);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const result = await importProjectsFromFile(file, 'merge');
      showNotification('success', `Imported ${result.imported} project${result.imported !== 1 ? 's' : ''}!`);
      onRefresh(); // Refresh the project list
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to import projects');
      console.error(err);
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCoverUploadClick = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    setUploadingCoverForProjectId(projectId);
    coverInputRef.current?.click();
  };

  const handleCoverFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadingCoverForProjectId) return;

    const project = projects.find(p => p.id === uploadingCoverForProjectId);
    if (!project) return;

    try {
      // Convert to base64
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        onUpdateProject({ ...project, coverImageUrl: base64 });
        showNotification('success', 'Cover image updated!');
      };
      reader.readAsDataURL(file);
    } catch (err) {
      showNotification('error', 'Failed to upload cover image');
      console.error(err);
    }

    // Reset
    setUploadingCoverForProjectId(null);
    if (coverInputRef.current) {
      coverInputRef.current.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 p-8 md:p-12 overflow-y-auto custom-scrollbar">
      <div className="max-w-7xl mx-auto space-y-12">

        {/* Notification Toast */}
        {notification && (
          <div className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-xl animate-fade-in ${notification.type === 'success'
            ? 'bg-green-900/90 border border-green-700 text-green-200'
            : 'bg-red-900/90 border border-red-700 text-red-200'
            }`}>
            {notification.type === 'success'
              ? <CheckCircle className="w-5 h-5 text-green-400" />
              : <AlertCircle className="w-5 h-5 text-red-400" />
            }
            <span className="font-medium">{notification.message}</span>
          </div>
        )}

        {/* Hidden file input for import */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Hidden file input for cover image upload */}
        <input
          ref={coverInputRef}
          type="file"
          accept="image/*"
          onChange={handleCoverFileChange}
          className="hidden"
        />

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-neutral-800 pb-8">
          <div className="space-y-2">
            <h1 className="text-4xl md:text-5xl font-serif font-bold text-white tracking-tight flex items-center gap-3">
              <Film className="w-10 h-10 text-red-600" />
              Slop Board
              <span className="text-xs font-normal text-neutral-600 ml-2">v1.4.4</span>
            </h1>
            <p className="text-neutral-500 uppercase tracking-widest text-sm font-medium">Cinematic Project Manager</p>
          </div>
          <div className="flex items-center gap-3">
            {/* User Account */}
            {authUser && (
              <div className="flex items-center gap-2 mr-2 pr-4 border-r border-neutral-800">
                {authUser.photoURL && (
                  <img src={authUser.photoURL} alt="" className="w-7 h-7 rounded-full ring-1 ring-neutral-700" referrerPolicy="no-referrer" />
                )}
                <span className="text-xs text-neutral-500 hidden lg:inline max-w-[120px] truncate">{authUser.displayName || authUser.email}</span>
                {onSignOut && (
                  <button
                    onClick={onSignOut}
                    className="p-1.5 text-neutral-600 hover:text-red-500 transition-colors"
                    title="Sign out"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
            {/* Auto-Backup to Disk Button */}
            {backupStatus?.isSupported && onSetBackupFile && (
              <button
                onClick={onSetBackupFile}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${backupStatus.isActive
                  ? 'text-green-400 bg-green-900/20 border border-green-800 hover:bg-green-900/30'
                  : 'text-yellow-400 bg-yellow-900/20 border border-yellow-800/50 hover:bg-yellow-900/30'
                  }`}
                title={backupStatus.isActive
                  ? `Auto-backup active${backupStatus.lastBackupTime ? ` — Last: ${new Date(backupStatus.lastBackupTime).toLocaleTimeString()}` : ''}`
                  : 'Set a backup file on disk for auto-save (recommended!)'
                }
              >
                <HardDrive className="w-4 h-4" />
                {backupStatus.isActive ? (
                  <>
                    <Shield className="w-3 h-3" />
                    <span className="hidden lg:inline">Auto-Backup Active</span>
                  </>
                ) : (
                  <span>Set Backup File</span>
                )}
              </button>
            )}
            <button
              onClick={handleImportClick}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-neutral-400 hover:text-white bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors"
              title="Import projects from backup"
            >
              <Upload className="w-4 h-4" />
              Import
            </button>
            <button
              onClick={handleExport}
              disabled={projects.length === 0}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-neutral-400 hover:text-white bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Export all projects to backup file"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
            <Button size="lg" onClick={onCreate} className="shadow-lg shadow-red-900/20">
              <Plus className="w-5 h-5 mr-2" /> New Project
            </Button>
          </div>
        </div>

        {/* Project Grid */}
        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 border border-dashed border-neutral-800 rounded-2xl bg-neutral-900/30">
            <div className="w-20 h-20 bg-neutral-900 rounded-full flex items-center justify-center mb-6">
              <Clapperboard className="w-10 h-10 text-neutral-700" />
            </div>
            <h3 className="text-xl font-serif text-white mb-2">No Projects Yet</h3>
            <p className="text-neutral-500 mb-8 max-w-md text-center">Start your first cinematic storyboard sequence. Define characters, locations, and shots with AI assistance.</p>
            <Button size="lg" variant="secondary" onClick={onCreate}>
              Start First Project
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map(project => {
              // Collect all shots from both legacy shots array and scenes
              const allShots = [
                ...(project.shots || []),
                ...(project.scenes || []).flatMap(scene => scene.shots || [])
              ];
              // Use custom cover image, otherwise fall back to first shot with an image
              const coverShot = allShots.find(s => s.imageUrl);
              const displayImage = project.coverImageUrl || coverShot?.imageUrl;
              const shotCount = allShots.length;
              const charCount = project.characters.length;
              const locCount = project.locations.length;

              return (
                <div
                  key={project.id}
                  onClick={() => onSelect(project.id)}
                  className="group relative bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden hover:border-neutral-600 hover:shadow-2xl transition-all cursor-pointer flex flex-col h-64"
                >
                  {/* Thumbnail Area */}
                  <div className="h-32 bg-black relative overflow-hidden border-b border-neutral-800">
                    {displayImage ? (
                      <img
                        src={displayImage}
                        alt="Project Cover"
                        className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity group-hover:scale-105 duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-neutral-950">
                        <LayoutGrid className="w-8 h-8 text-neutral-800" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 to-transparent opacity-80" />

                    {/* Action buttons */}
                    <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-all z-10">
                      <button
                        onClick={(e) => handleCoverUploadClick(e, project.id)}
                        className="p-2 bg-black/50 text-neutral-400 hover:text-green-400 hover:bg-black rounded-full transition-colors"
                        title="Upload Cover Image"
                      >
                        <ImagePlus className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          exportSingleProjectToFile(project);
                          showNotification('success', `Exported "${project.title}"`);
                        }}
                        className="p-2 bg-black/50 text-neutral-400 hover:text-blue-400 hover:bg-black rounded-full transition-colors"
                        title="Export Project"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => onDelete(project.id, e)}
                        className="p-2 bg-black/50 text-neutral-400 hover:text-red-500 hover:bg-black rounded-full transition-colors"
                        title="Delete Project"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Info Area */}
                  <div className="p-5 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="text-xl font-serif font-bold text-white group-hover:text-red-500 transition-colors truncate">
                        {project.title}
                      </h3>
                      <div className="text-xs text-neutral-500 mt-1 flex gap-3">
                        <span>{shotCount} Shots</span>
                        <span>•</span>
                        <span>{charCount} Characters</span>
                        <span>•</span>
                        <span>{locCount} Locations</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-neutral-600 mt-4 border-t border-neutral-800 pt-3">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3 h-3" />
                        <span>Edited Recently</span>
                      </div>
                      <span className="uppercase tracking-wider font-bold text-[10px] bg-neutral-800 px-2 py-1 rounded text-neutral-400">
                        {project.settings.cinematographer.split(' ')[0]} Style
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="max-w-7xl mx-auto mt-12 pt-6 border-t border-neutral-800/50 text-center text-neutral-600 text-sm">
        Version 1.4.4
      </div>
    </div>
  );
};
