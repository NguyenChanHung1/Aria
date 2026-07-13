export const ANALYSIS_SCHEMA_VERSION = '2.0.0' as const;

export const SOURCE_TYPES = ['speech', 'singing', 'humming', 'solo_instrument', 'mixed_music', 'environmental_sound', 'beatboxing', 'unknown'] as const;
export const MUSIC_SCOPES = ['full_song', 'fragment', 'loop', 'unknown'] as const;
export const INTENDED_USES = ['transcribe_lyrics', 'extract_melody', 'use_as_vocal_performance', 'use_as_instrument_performance', 'use_as_style_reference', 'continue_recording', 'ignore'] as const;
export type SourceType = typeof SOURCE_TYPES[number];
export type MusicScope = typeof MUSIC_SCOPES[number];
export type IntendedUse = typeof INTENDED_USES[number];

export interface Candidate<T extends string> { value: T; probability: number }
export interface InputClassification {
  schemaVersion: typeof ANALYSIS_SCHEMA_VERSION;
  usability: Candidate<'usable' | 'unusable' | 'silence'>[];
  sourceType: Candidate<SourceType>[];
  musicScope: Candidate<MusicScope>[];
  reviewRecommendation: 'auto_accept' | 'needs_review';
  conflicts: string[];
  warnings: string[];
  model: { id: string; version: string; weightsSha256: string; preprocessingVersion: string; thresholdPolicyVersion: string };
}

export interface InputInterpretation {
  schemaVersion: typeof ANALYSIS_SCHEMA_VERSION;
  inputId: string;
  version: number;
  sourceType: SourceType;
  musicScope: MusicScope;
  intendedUses: IntendedUse[];
  suggestedUses: Array<{ value: IntendedUse; reason: string }>;
  origins: { sourceType: 'inferred' | 'user'; musicScope: 'inferred' | 'user'; intendedUses: 'inferred' | 'user' };
  reviewStatus: 'auto_accepted' | 'needs_review' | 'user_confirmed' | 'user_corrected';
  classificationArtifactId: string;
  warnings: string[];
  actor: string;
  createdAt: string;
}

export interface WorkerResult {
  acoustic: { checksumSha256: string; fileSize: number; payload: Record<string, unknown> };
  embeddings: { checksumSha256: string; fileSize: number; manifest: Record<string, unknown> };
  classification: { checksumSha256: string; fileSize: number; payload: InputClassification };
}
