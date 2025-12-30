
export type AspectRatio = '16:9' | '9:16' | '2.39:1' | '4:3' | '1:1';

export type ShotType =
  | 'Extreme Wide'
  | 'Wide'
  | 'Medium'
  | 'Close Up'
  | 'Extreme Close Up'
  | 'Insert'
  | 'High Angle'
  | 'Low Angle'
  | 'Dutch Angle (45°)'
  | 'Overhead'
  | 'Over the Shoulder';

export type CameraMove =
  | 'Static'
  | 'Dolly In'
  | 'Dolly Out'
  | 'Pan'
  | 'Tilt'
  | 'Handheld'
  | 'Tracking'
  | 'Crane'
  | 'Arc'
  | 'Zoom In'
  | 'Zoom Out'
  | 'Whip Pan';

export interface CinematicSettings {
  cinematographer: string;
  filmStock: string;
  lens: string;
  lighting: string;
  aspectRatio: AspectRatio;
  colorGrade: string;
}

export interface Character {
  id: string;
  name: string;
  description: string;
  imageUrl?: string; // Base64
  originalImageUrl?: string; // Base64 - stores the first generated/uploaded image for reset
  isGenerating?: boolean;
  isEditing?: boolean;
  isUpdating?: boolean; // For "Update with Details" operation
  // Extended fields for more precise editing
  age?: string;
  occupation?: string;
  wardrobe?: string;
  physicalFeatures?: string;
  personality?: string;
  voiceNotes?: string;
}

export interface Location {
  id: string;
  name: string;
  description: string;
  imageUrl?: string; // Base64
  originalImageUrl?: string; // Base64 - stores the first generated/uploaded image for reset
  isGenerating?: boolean;
  isEditing?: boolean;
  isUpdating?: boolean; // For "Update with Details" operation
  // Extended fields for more precise editing
  timeOfDay?: string;
  weather?: string;
  atmosphere?: string;
  keyProps?: string;
  soundAmbience?: string;
  practicalLighting?: string;
}

export interface DialogueLine {
  id: string;
  speakerId: string; // Links to a Character ID or empty for generic
  text: string;
}

export interface VideoSegment {
  id: string;
  url: string;
  timestamp: number;
  model: 'fast' | 'quality';
  isExtension: boolean; // true if this segment was created by extending
}

export interface ImageHistoryEntry {
  id: string;
  imageUrl: string; // Base64
  timestamp: number;
  source: 'generate' | 'alter' | 'edit' | 'upload'; // How this image was created
}

export interface Shot {
  id: string;
  number: number;
  description: string;
  action: string;
  dialogueLines: DialogueLine[];
  shotType: ShotType;
  cameraMove: CameraMove;
  characters: string[]; // IDs of characters present in shot
  locationId: string;
  referenceShotId?: string; // ID of another shot to use as visual reference
  imageUrl?: string; // Base64
  imageHistory?: ImageHistoryEntry[]; // Version history of images
  videoUrl?: string; // Base64 or Blob URL
  videoSegments?: VideoSegment[]; // Array of video segments in order (for stringout)
  videoPrompt?: string; // The specific prompt used/to-be-used for video generation
  videoError?: string; // Error message from video generation (e.g. content policy)
  isVideoGenerating?: boolean;
  isExtending?: boolean;
  videoModel?: 'fast' | 'quality';
  isGenerating: boolean;
  isEditing: boolean;
  isAltering?: boolean;
  notes?: string;
}

export interface Scene {
  id: string;
  name: string;
  description?: string;
  scriptContent: string; // Each scene has its own script content
  shots: Shot[];
  order: number; // For ordering scenes in the project
}

export interface Project {
  id: string;
  title: string;
  scriptContent: string; // Legacy - can be used for overall script or removed
  settings: CinematicSettings;
  characters: Character[]; // Shared across all scenes
  locations: Location[]; // Shared across all scenes
  scenes: Scene[]; // Multiple scenes per project
  shots: Shot[]; // Legacy - for backward compatibility
  coverImageUrl?: string; // Custom cover image for project dashboard
}
