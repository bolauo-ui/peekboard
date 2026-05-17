export interface User {
  id: string;
  email: string;
  name: string;
  avatar_color: string;
  email_verified?: boolean;
  avatar_url?:    string;
  use_case?:      'work' | 'personal' | 'design-review' | 'moodboard' | 'other';
}

export interface Project {
  id: string;
  owner_id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface Board {
  id: string;
  name: string;
  owner_id: string;
  owner_name: string;
  canvas_data: string;
  width: number;
  height: number;
  created_at: string;
  updated_at: string;
  role: 'owner' | 'editor' | 'commenter' | 'viewer';
  starred?: boolean;
  last_edited_by?: string;
  last_edited_at?: string;
  last_edited_by_name?:  string;
  last_edited_by_color?: string;
  project_id?:     string | null;
  thumbnail_url?:  string | null;
}

export interface BoardMember {
  id: string;
  board_id: string;
  email: string;
  user_id: string | null;
  name: string | null;
  avatar_color: string | null;
  role: 'editor' | 'commenter' | 'viewer';
  accepted: number;
  invite_token: string;
  created_at: string;
}

export interface Comment {
  id: string;
  board_id: string;
  user_id: string;
  user_name: string;
  avatar_color: string;
  x: number;
  y: number;
  content: string;
  parent_id: string | null;
  resolved: number;
  created_at: string;
}

export interface MediaItem {
  id: string;
  type: 'gif' | 'mp4' | 'webm';
  url: string;
  left: number;
  top: number;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  angle: number;
  opacity: number;
  clipRadius?: number; // optional rounded corner radius (px, applied before scale)
}

export interface CanvasData {
  fabricData: Record<string, unknown>;
  mediaItems: MediaItem[];
  viewport?:  [number, number, number, number, number, number]; // fabric viewport transform
}

export type Tool = 'select' | 'hand' | 'text' | 'comment' | 'frame';

export type FramePreset = {
  label: string;
  width: number;
  height: number;
};

export const FRAME_PRESETS: FramePreset[] = [
  { label: 'Instagram Post', width: 1080, height: 1080 },
  { label: 'Instagram Story', width: 1080, height: 1920 },
  { label: 'Twitter/X Post', width: 1200, height: 675 },
  { label: 'LinkedIn', width: 1200, height: 627 },
  { label: 'YouTube Thumbnail', width: 1280, height: 720 },
  { label: '1080p HD', width: 1920, height: 1080 },
  { label: '4K UHD', width: 3840, height: 2160 },
  { label: 'Square', width: 1000, height: 1000 },
];
