/** Mood and genre options exposed to non-experts in plain language. */
export type Mood =
  | "happy"
  | "sad"
  | "energetic"
  | "chill"
  | "romantic"
  | "epic"
  | "mysterious";

export type Genre =
  | "pop"
  | "rock"
  | "hip-hop"
  | "r-and-b"
  | "electronic"
  | "folk"
  | "jazz"
  | "country";

export type SongLength = "short" | "medium" | "long";

export type VocalStyle = "male" | "female" | "duet" | "instrumental";

export interface SongBrief {
  title?: string;
  /** Free-text description in the user's own words */
  idea: string;
  mood: Mood;
  genre: Genre;
  length: SongLength;
  vocalStyle: VocalStyle;
  language?: string;
}

export type PipelineStage =
  | "planning"
  | "lyrics"
  | "composition"
  | "mixing"
  | "complete"
  | "failed";

export interface SongPlan {
  title: string;
  summary: string;
  bpm: number;
  key: string;
  structure: SongSection[];
  instrumentation: string[];
  productionNotes: string[];
}

export interface SongSection {
  name: string;
  bars: number;
  description: string;
}

export interface LyricsResult {
  fullText: string;
  sections: Record<string, string>;
}

export interface CompositionResult {
  midiPath: string;
  stemPaths: string[];
  instrumentalPreviewPath: string;
  durationSeconds: number;
}

export interface MixResult {
  audioPath: string;
  format: "wav" | "mp3";
  durationSeconds: number;
  loudnessLufs: number;
}

export interface SongProject {
  id: string;
  brief: SongBrief;
  stage: PipelineStage;
  plan?: SongPlan;
  lyrics?: LyricsResult;
  composition?: CompositionResult;
  mix?: MixResult;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSongRequest {
  brief: SongBrief;
}

export interface CreateSongResponse {
  projectId: string;
  stage: PipelineStage;
}

export interface ProjectStatusResponse {
  project: SongProject;
}
