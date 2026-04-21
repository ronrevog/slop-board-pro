
export type AspectRatio = '1:1' | '2:3' | '3:2' | '3:4' | '4:3' | '4:5' | '5:4' | '9:16' | '16:9' | '21:9' | '2.39:1' | '1:4' | '4:1' | '1:8' | '8:1';

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

export type CompositionTechnique =
  | 'None'
  | 'Rule of Thirds'
  | 'Golden Ratio'
  | 'Symmetry'
  | 'Negative Space'
  | 'Juxtaposition'
  | 'Diagonal Lines'
  | 'Golden Triangle';

export type Resolution = 'basic' | '720p' | '1080p' | '4k';

export interface CinematicSettings {
  cinematographer: string;
  filmStock: string;
  lens: string;
  lighting: string;
  aspectRatio: AspectRatio;
  resolution: Resolution;
  colorGrade: string;
}

export type VideoProvider = 'veo' | 'fal-wan' | 'fal-aurora' | 'seedance';

export interface VideoProviderSettings {
  provider: VideoProvider;
  falApiKey?: string;
  /**
   * PiAPI key — used for Seedance 2 `omni_reference` generations when the user
   * selects video references. Separate from the fal.ai key so either integration
   * can be used independently.
   */
  piapiApiKey?: string;
  // Wan v2.6 specific settings
  wanResolution: '720p' | '1080p';
  wanDuration: '5' | '10' | '15';
  wanEnableSafetyChecker: boolean;
  wanEnablePromptExpansion: boolean;
  wanMultiShots: boolean;
  wanNegativePrompt: string;
  wanSeed?: number;
  wanAudioUrl?: string;
  // Aurora (Creatify) specific settings
  auroraResolution: '480p' | '720p';
  auroraGuidanceScale: number;
  auroraAudioGuidanceScale: number;
  auroraAudioUrl?: string;
  auroraPrompt?: string;
  // Seedance 2.0 (fal.ai) specific settings
  seedanceModel: 'image-to-video' | 'text-to-video' | 'reference-to-video' | 'fast/text-to-video' | 'fast/reference-to-video';
  seedanceDuration: 'auto' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12' | '13' | '14' | '15';
  seedanceAspectRatio: 'auto' | '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16';
  seedanceResolution: '480p' | '720p';
  seedanceSeed?: number;
  seedanceNegativePrompt?: string;
  seedanceEnableSafetyChecker?: boolean;
}

export interface TurnaroundImage {
  id: string;
  angle: string;
  imageUrl: string;
  isSelected: boolean; // Whether this image is selected as a reference for shot generation
}

export interface Character {
  id: string;
  name: string;
  description: string;
  imageUrl?: string; // Base64
  originalImageUrl?: string; // Base64 - stores the first generated/uploaded image for reset
  turnaroundImages?: TurnaroundImage[]; // Multiple angle views
  isTurnaroundGenerating?: boolean;
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
  turnaroundImages?: TurnaroundImage[]; // Multiple angle views of the location
  isTurnaroundGenerating?: boolean;
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

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  imageUrl?: string; // The resulting image after this edit
  timestamp: number;
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
  seedanceTaskId?: string; // PiAPI task ID for Seedance extend
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
  composition: CompositionTechnique;
  characters: string[]; // IDs of characters present in shot
  locationId: string;
  referenceShotId?: string; // ID of another shot to use as visual reference
  referenceImages?: string[]; // Base64 reference photos uploaded by user for visual consistency
  sceneReferenceImage?: string; // Base64 — background/environment to place the character into
  characterReferenceImage?: string; // Base64 — character photo to composite into the scene reference
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
  isUpscaling?: boolean;
  isChatEditing?: boolean;
  chatHistory?: ChatMessage[]; // Multi-turn chat editing history
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
  videoSettings?: VideoProviderSettings; // Video generation provider and settings
  characters: Character[]; // Shared across all scenes
  locations: Location[]; // Shared across all scenes
  scenes: Scene[]; // Multiple scenes per project
  shots: Shot[]; // Legacy - for backward compatibility
  coverImageUrl?: string; // Custom cover image for project dashboard
}

// Default video provider settings
export const DEFAULT_VIDEO_SETTINGS: VideoProviderSettings = {
  provider: 'veo',
  wanResolution: '1080p',
  wanDuration: '5',
  wanEnableSafetyChecker: true,
  wanEnablePromptExpansion: true,
  wanMultiShots: false,
  wanNegativePrompt: '',
  auroraResolution: '720p',
  auroraGuidanceScale: 1,
  auroraAudioGuidanceScale: 2,
  seedanceModel: 'image-to-video',
  seedanceDuration: '5',
  seedanceAspectRatio: '16:9',
  seedanceResolution: '720p',
};
