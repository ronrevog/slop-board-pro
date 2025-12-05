
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
  isGenerating?: boolean;
  isEditing?: boolean;
}

export interface Location {
  id: string;
  name: string;
  description: string;
  imageUrl?: string; // Base64
  isGenerating?: boolean;
  isEditing?: boolean;
}

export interface DialogueLine {
  id: string;
  speakerId: string; // Links to a Character ID or empty for generic
  text: string;
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
  videoUrl?: string; // Base64 or Blob URL
  videoPrompt?: string; // The specific prompt used/to-be-used for video generation
  isVideoGenerating?: boolean;
  videoModel?: 'fast' | 'quality';
  isGenerating: boolean;
  isEditing: boolean;
  isAltering?: boolean;
  notes?: string;
}

export interface Project {
  id: string;
  title: string;
  scriptContent: string;
  settings: CinematicSettings;
  characters: Character[];
  locations: Location[];
  shots: Shot[];
}
