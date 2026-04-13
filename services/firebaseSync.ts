/**
 * Firebase Cloud Sync Service
 * 
 * Handles:
 * - Saving/loading projects to/from Cloud Firestore
 * - Uploading base64 images to Firebase Storage → replacing with download URLs
 * - Debounced auto-sync on every project update
 * 
 * Firestore structure:
 *   users/{uid}/projects/{projectId} → project document (images as URLs, not base64)
 */

import {
    collection,
    doc,
    setDoc,
    getDoc,
    getDocs,
    deleteDoc,
    serverTimestamp,
    writeBatch,
} from 'firebase/firestore';
import {
    ref,
    uploadBytes,
    getDownloadURL,
    deleteObject,
} from 'firebase/storage';
import { db, storage } from './firebase';
import { getCurrentUser } from './firebaseAuth';
import { Project } from '../types';

// ============================================================
// Image Upload Helpers
// ============================================================

/**
 * Convert a base64 data URL to a Blob for upload.
 */
const dataUrlToBlob = (dataUrl: string): Blob => {
    const parts = dataUrl.split(',');
    const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/png';
    const bstr = atob(parts[1]);
    const u8arr = new Uint8Array(bstr.length);
    for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);
    return new Blob([u8arr], { type: mime });
};

/**
 * Upload a single base64 image to Firebase Storage.
 * Returns the download URL.
 */
const uploadBase64Image = async (
    uid: string,
    projectId: string,
    imagePath: string,
    base64DataUrl: string
): Promise<string> => {
    const ext = base64DataUrl.startsWith('data:image/jpeg') ? 'jpg'
        : base64DataUrl.startsWith('data:image/webp') ? 'webp'
            : 'png';
    const storageRef = ref(storage, `users/${uid}/projects/${projectId}/${imagePath}.${ext}`);
    const blob = dataUrlToBlob(base64DataUrl);
    await uploadBytes(storageRef, blob);
    return getDownloadURL(storageRef);
};

/**
 * Walk through a project and upload all base64 images to Firebase Storage.
 * Replaces base64 data URLs in-place with https:// download URLs.
 * Returns a deep clone with all images as URLs.
 */
const uploadProjectImages = async (uid: string, project: Project): Promise<Project> => {
    const p = JSON.parse(JSON.stringify(project)) as Project; // deep clone
    const uploads: Promise<void>[] = [];

    // Helper: if value is base64, schedule an upload and return a setter
    const processImage = (
        obj: any,
        key: string,
        pathPrefix: string
    ) => {
        const val = obj[key];
        if (typeof val === 'string' && val.startsWith('data:')) {
            const id = `${pathPrefix}_${key}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            uploads.push(
                uploadBase64Image(uid, p.id, id, val).then(url => {
                    obj[key] = url;
                })
            );
        }
    };

    // Cover image
    processImage(p, 'coverImageUrl', 'cover');

    // Characters
    p.characters.forEach((char, ci) => {
        processImage(char, 'imageUrl', `char_${ci}`);
        processImage(char, 'originalImageUrl', `char_${ci}_orig`);
        char.turnaroundImages?.forEach((t, ti) => {
            processImage(t, 'imageUrl', `char_${ci}_turn_${ti}`);
        });
    });

    // Locations
    p.locations.forEach((loc, li) => {
        processImage(loc, 'imageUrl', `loc_${li}`);
        processImage(loc, 'originalImageUrl', `loc_${li}_orig`);
        loc.turnaroundImages?.forEach((t, ti) => {
            processImage(t, 'imageUrl', `loc_${li}_turn_${ti}`);
        });
    });

    // Scenes → Shots
    const processShots = (shots: any[], prefix: string) => {
        shots.forEach((shot: any, si: number) => {
            processImage(shot, 'imageUrl', `${prefix}_shot_${si}`);
            // Video data URLs
            if (typeof shot.videoUrl === 'string' && shot.videoUrl.startsWith('data:')) {
                processImage(shot, 'videoUrl', `${prefix}_shot_${si}_video`);
            }
            // Reference images
            shot.referenceImages?.forEach((refImg: string, ri: number) => {
                if (refImg.startsWith('data:')) {
                    uploads.push(
                        uploadBase64Image(uid, p.id, `${prefix}_shot_${si}_ref_${ri}`, refImg).then(url => {
                            shot.referenceImages[ri] = url;
                        })
                    );
                }
            });
            processImage(shot, 'sceneReferenceImage', `${prefix}_shot_${si}_sceneRef`);
            processImage(shot, 'characterReferenceImage', `${prefix}_shot_${si}_charRef`);
            // Image history
            shot.imageHistory?.forEach((entry: any, hi: number) => {
                processImage(entry, 'imageUrl', `${prefix}_shot_${si}_hist_${hi}`);
            });
            // Video segments
            shot.videoSegments?.forEach((seg: any, vi: number) => {
                if (typeof seg.url === 'string' && seg.url.startsWith('data:')) {
                    processImage(seg, 'url', `${prefix}_shot_${si}_vseg_${vi}`);
                }
            });
            // Chat history images
            shot.chatHistory?.forEach((msg: any, mi: number) => {
                processImage(msg, 'imageUrl', `${prefix}_shot_${si}_chat_${mi}`);
            });
        });
    };

    p.scenes?.forEach((scene, sci) => {
        processShots(scene.shots || [], `scene_${sci}`);
    });

    // Legacy shots
    if (p.shots?.length) {
        processShots(p.shots, 'legacy');
    }

    // Wait for all uploads to complete
    if (uploads.length > 0) {
        console.log(`☁️ Uploading ${uploads.length} images to Firebase Storage...`);
        await Promise.all(uploads);
        console.log(`✅ All ${uploads.length} images uploaded`);
    }

    return p;
};

// ============================================================
// Firestore CRUD
// ============================================================

/** Get the Firestore collection ref for a user's projects */
const projectsCol = (uid: string) => collection(db, 'users', uid, 'projects');

/** Get a single project doc ref */
const projectDoc = (uid: string, projectId: string) => doc(db, 'users', uid, 'projects', projectId);

/**
 * Save a project to Firestore (uploading images to Storage first).
 */
export const saveProjectToCloud = async (project: Project): Promise<void> => {
    const user = getCurrentUser();
    if (!user) {
        console.warn('Cannot save to cloud — not signed in');
        return;
    }

    try {
        // Upload base64 images → get URL versions
        const cloudProject = await uploadProjectImages(user.uid, project);

        // Save to Firestore
        await setDoc(projectDoc(user.uid, project.id), {
            ...cloudProject,
            _updatedAt: serverTimestamp(),
            _uid: user.uid,
        });
        console.log(`☁️ Project "${project.title}" saved to cloud`);
    } catch (error: any) {
        console.error('Cloud save failed:', error);
        // Don't throw — cloud save failure shouldn't break the app
    }
};

/**
 * Load all projects from Firestore for the current user.
 */
export const loadProjectsFromCloud = async (): Promise<Project[]> => {
    const user = getCurrentUser();
    if (!user) return [];

    try {
        const snapshot = await getDocs(projectsCol(user.uid));
        const projects: Project[] = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            // Strip Firestore metadata fields
            delete data._updatedAt;
            delete data._uid;
            projects.push(data as Project);
        });
        console.log(`☁️ Loaded ${projects.length} projects from cloud`);
        return projects;
    } catch (error: any) {
        console.error('Cloud load failed:', error);
        return [];
    }
};

/**
 * Delete a project from Firestore.
 */
export const deleteProjectFromCloud = async (projectId: string): Promise<void> => {
    const user = getCurrentUser();
    if (!user) return;

    try {
        await deleteDoc(projectDoc(user.uid, projectId));
        console.log(`☁️ Project ${projectId} deleted from cloud`);
    } catch (error: any) {
        console.error('Cloud delete failed:', error);
    }
};

// ============================================================
// Debounced Auto-Sync
// ============================================================

const _syncTimers = new Map<string, ReturnType<typeof setTimeout>>();
const SYNC_DEBOUNCE_MS = 5000; // 5 seconds

/**
 * Schedule a debounced cloud sync for a project.
 * Call this after every local save.
 */
export const scheduleCloudSync = (project: Project): void => {
    const user = getCurrentUser();
    if (!user) return;

    // Clear previous timer for this project
    const existing = _syncTimers.get(project.id);
    if (existing) clearTimeout(existing);

    // Set new timer
    _syncTimers.set(
        project.id,
        setTimeout(() => {
            _syncTimers.delete(project.id);
            saveProjectToCloud(project);
        }, SYNC_DEBOUNCE_MS)
    );
};

/**
 * Force-sync all projects to cloud immediately (e.g. on first login migration).
 */
export const syncAllProjectsToCloud = async (projects: Project[]): Promise<void> => {
    const user = getCurrentUser();
    if (!user) return;

    console.log(`☁️ Syncing ${projects.length} projects to cloud...`);
    for (const project of projects) {
        await saveProjectToCloud(project);
    }
    console.log('✅ All projects synced to cloud');
};
