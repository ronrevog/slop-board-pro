
const DB_NAME = 'SlopBoardDB';
const STORE_NAME = 'projects';
const DB_VERSION = 1;

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
