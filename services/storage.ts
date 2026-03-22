
const DB_NAME = 'SlopBoardDB';
const STORE_NAME = 'projects';
const DB_VERSION = 1;

// ========== FILE SYSTEM ACCESS API AUTO-BACKUP ==========

// In-memory file handle for the current session
let _fileBackupHandle: FileSystemFileHandle | null = null;
let _lastFileBackupTime: number | null = null;
let _fileBackupError: string | null = null;

// Check if File System Access API is supported
export const isFileSystemAccessSupported = (): boolean => {
  return 'showSaveFilePicker' in window;
};

// Let user pick a backup file location (call once per session)
export const initFileBackupHandle = async (): Promise<boolean> => {
  if (!isFileSystemAccessSupported()) return false;

  try {
    const handle = await (window as any).showSaveFilePicker({
      suggestedName: `slop-board-autobackup.json`,
      types: [
        {
          description: 'JSON Backup',
          accept: { 'application/json': ['.json'] },
        },
      ],
    });
    _fileBackupHandle = handle;
    _fileBackupError = null;
    // Do an immediate backup
    const projects = await getAllProjectsFromDB();
    await writeFileBackup(projects);
    return true;
  } catch (e: any) {
    // User cancelled the picker
    if (e.name === 'AbortError') return false;
    _fileBackupError = e.message || 'Failed to set backup file';
    console.error('File backup init failed:', e);
    return false;
  }
};

// Write all projects to the backup file silently
export const writeFileBackup = async (projects: any[]): Promise<boolean> => {
  if (!_fileBackupHandle) return false;

  try {
    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      appName: 'Slop-Board',
      autoBackup: true,
      projects: projects,
    };

    const writable = await (_fileBackupHandle as any).createWritable();
    await writable.write(JSON.stringify(exportData, null, 2));
    await writable.close();

    _lastFileBackupTime = Date.now();
    _fileBackupError = null;
    return true;
  } catch (e: any) {
    console.error('File backup write failed:', e);
    _fileBackupError = e.message || 'Write failed';
    // If permission was revoked, clear the handle
    if (e.name === 'NotAllowedError' || e.name === 'SecurityError') {
      _fileBackupHandle = null;
    }
    return false;
  }
};

// Get backup status info for UI
export const getFileBackupStatus = (): {
  isActive: boolean;
  lastBackupTime: number | null;
  error: string | null;
  isSupported: boolean;
} => ({
  isActive: _fileBackupHandle !== null,
  lastBackupTime: _lastFileBackupTime,
  error: _fileBackupError,
  isSupported: isFileSystemAccessSupported(),
});

// ========== LOCALSTORAGE EMERGENCY SNAPSHOT ==========

const SNAPSHOT_KEY = 'slop_board_emergency_snapshot';
const SNAPSHOT_META_KEY = 'slop_board_snapshot_meta';

// Strip base64 images from a project to keep size under localStorage limits (~5MB)
const stripImagesFromProject = (project: any): any => {
  const stripped = { ...project };

  // Strip character images
  if (stripped.characters) {
    stripped.characters = stripped.characters.map((c: any) => ({
      ...c,
      imageUrl: c.imageUrl?.startsWith('data:') ? '[base64-stripped]' : c.imageUrl,
      originalImageUrl: undefined,
      turnaroundImages: c.turnaroundImages?.map((t: any) => ({
        ...t,
        imageUrl: t.imageUrl?.startsWith('data:') ? '[base64-stripped]' : t.imageUrl,
      })),
    }));
  }

  // Strip location images
  if (stripped.locations) {
    stripped.locations = stripped.locations.map((l: any) => ({
      ...l,
      imageUrl: l.imageUrl?.startsWith('data:') ? '[base64-stripped]' : l.imageUrl,
      originalImageUrl: undefined,
      turnaroundImages: l.turnaroundImages?.map((t: any) => ({
        ...t,
        imageUrl: t.imageUrl?.startsWith('data:') ? '[base64-stripped]' : t.imageUrl,
      })),
    }));
  }

  // Strip shot images and video data
  const stripShots = (shots: any[]) =>
    shots?.map((s: any) => ({
      ...s,
      imageUrl: s.imageUrl?.startsWith('data:') ? '[base64-stripped]' : s.imageUrl,
      videoUrl: undefined,
      videoSegments: s.videoSegments?.map((seg: any) => ({
        ...seg,
        url: seg.url?.startsWith('data:') || seg.url?.startsWith('blob:') ? '[stripped]' : seg.url,
      })),
      imageHistory: undefined, // Drop image history to save space
      referenceImages: undefined,
      sceneReferenceImage: undefined,
      characterReferenceImage: undefined,
      chatHistory: s.chatHistory?.map((msg: any) => ({
        ...msg,
        imageUrl: undefined,
      })),
    })) || [];

  // Strip scenes
  if (stripped.scenes) {
    stripped.scenes = stripped.scenes.map((scene: any) => ({
      ...scene,
      shots: stripShots(scene.shots),
    }));
  }

  // Strip legacy shots
  if (stripped.shots) {
    stripped.shots = stripShots(stripped.shots);
  }

  // Strip cover image
  if (stripped.coverImageUrl?.startsWith('data:')) {
    stripped.coverImageUrl = '[base64-stripped]';
  }

  return stripped;
};

// Save emergency snapshot to localStorage
export const saveEmergencySnapshot = (projects: any[]): boolean => {
  try {
    const stripped = projects.map(stripImagesFromProject);
    const data = JSON.stringify({
      version: 1,
      appName: 'Slop-Board',
      emergencySnapshot: true,
      projects: stripped,
    });

    // Check if it'll fit (localStorage is ~5MB)
    if (data.length > 4 * 1024 * 1024) {
      console.warn('Emergency snapshot too large for localStorage, saving partial...');
      // Try saving just the first 3 projects
      const partial = JSON.stringify({
        version: 1,
        appName: 'Slop-Board',
        emergencySnapshot: true,
        partial: true,
        projects: stripped.slice(0, 3),
      });
      localStorage.setItem(SNAPSHOT_KEY, partial);
    } else {
      localStorage.setItem(SNAPSHOT_KEY, data);
    }

    localStorage.setItem(SNAPSHOT_META_KEY, JSON.stringify({
      savedAt: new Date().toISOString(),
      projectCount: projects.length,
      projectTitles: projects.map(p => p.title),
    }));

    return true;
  } catch (e) {
    console.error('Emergency snapshot save failed:', e);
    return false;
  }
};

// Get emergency snapshot from localStorage
export const getEmergencySnapshot = (): { projects: any[]; meta: any } | null => {
  try {
    const data = localStorage.getItem(SNAPSHOT_KEY);
    const meta = localStorage.getItem(SNAPSHOT_META_KEY);
    if (!data) return null;

    const parsed = JSON.parse(data);
    if (!parsed.projects || parsed.projects.length === 0) return null;

    return {
      projects: parsed.projects,
      meta: meta ? JSON.parse(meta) : null,
    };
  } catch (e) {
    console.error('Failed to read emergency snapshot:', e);
    return null;
  }
};

// Clear emergency snapshot (after successful recovery)
export const clearEmergencySnapshot = () => {
  localStorage.removeItem(SNAPSHOT_KEY);
  localStorage.removeItem(SNAPSHOT_META_KEY);
};

// ========== UNIFIED BACKUP TRIGGER ==========

// Debounce timer for file backup (don't write to disk on every keystroke)
let _fileBackupTimer: ReturnType<typeof setTimeout> | null = null;

// Call this after every IndexedDB save to trigger both backup mechanisms
export const triggerAutoBackup = (projects: any[]) => {
  // localStorage snapshot — immediate (it's fast)
  saveEmergencySnapshot(projects);

  // File backup — debounced to every 5 seconds
  if (_fileBackupHandle) {
    if (_fileBackupTimer) clearTimeout(_fileBackupTimer);
    _fileBackupTimer = setTimeout(() => {
      writeFileBackup(projects);
    }, 5000);
  }
};

export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
};

export const saveProjectToDB = async (project: any) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(project);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
};

export const deleteProjectFromDB = async (id: string) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
};

export const getAllProjectsFromDB = async (): Promise<any[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

// Export all projects to a JSON file
export const exportProjectsToFile = async () => {
  const projects = await getAllProjectsFromDB();
  const exportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    appName: 'Slop-Board',
    projects: projects
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const date = new Date().toISOString().split('T')[0];
  // Include project names in the filename
  const projectNames = projects
    .map(p => (p.title || 'untitled').replace(/[^a-z0-9]/gi, '-').toLowerCase())
    .slice(0, 3) // Limit to first 3 names to keep filename reasonable
    .join('_');
  const suffix = projects.length > 3 ? `_and-${projects.length - 3}-more` : '';
  link.download = `${projectNames}${suffix}-backup-${date}.json`;
  link.href = url;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return projects.length;
};

// Export a single project to a JSON file
export const exportSingleProjectToFile = (project: any) => {
  const exportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    appName: 'Slop-Board',
    projects: [project]
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const date = new Date().toISOString().split('T')[0];
  const sanitizedTitle = project.title.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  link.download = `slop-board-${sanitizedTitle}-${date}.json`;
  link.href = url;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// Import projects from a JSON file
export const importProjectsFromFile = async (file: File, mode: 'merge' | 'replace' = 'merge'): Promise<{ imported: number; skipped: number }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content);

        // Validate the file structure
        if (!data.projects || !Array.isArray(data.projects)) {
          throw new Error('Invalid backup file: missing projects array');
        }

        if (data.appName && data.appName !== 'Slop-Board') {
          throw new Error('Invalid backup file: not a Slop-Board backup');
        }

        let imported = 0;
        let skipped = 0;

        // If replace mode, clear existing projects first
        if (mode === 'replace') {
          const existingProjects = await getAllProjectsFromDB();
          for (const project of existingProjects) {
            await deleteProjectFromDB(project.id);
          }
        }

        // Get existing project IDs for merge mode
        const existingIds = mode === 'merge'
          ? new Set((await getAllProjectsFromDB()).map(p => p.id))
          : new Set();

        // Import each project
        for (const project of data.projects) {
          if (!project.id) {
            skipped++;
            continue;
          }

          if (mode === 'merge' && existingIds.has(project.id)) {
            // In merge mode, create new ID for duplicates
            project.id = crypto.randomUUID();
            project.title = `${project.title} (Imported)`;
          }

          await saveProjectToDB(project);
          imported++;
        }

        resolve({ imported, skipped });
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
};
