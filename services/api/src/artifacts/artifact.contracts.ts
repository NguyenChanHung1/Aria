export const ARTIFACT_SCHEMA_VERSION = '1.0.0' as const;

export type SchemaVersion = typeof ARTIFACT_SCHEMA_VERSION;
export type ProjectStatus = 'draft' | 'active' | 'complete' | 'failed' | 'archived';
export type ArtifactStatus = 'pending' | 'processing' | 'available' | 'failed' | 'superseded' | 'deleted';
export type ReviewDecision = 'pending' | 'approved' | 'changes_requested' | 'rejected';
export type DependencyKind = 'derived_from' | 'requires' | 'composes' | 'references';

export const ARTIFACT_NAMESPACES = [
  'originals',
  'normalized-audio',
  'analysis',
  'requirements',
  'creative-direction',
  'blueprints',
  'lyrics',
  'scores',
  'arrangements',
  'performances',
  'stems',
  'mixes',
  'masters',
  'reviews',
  'previews',
  'exports',
] as const;

export type ArtifactNamespace = (typeof ARTIFACT_NAMESPACES)[number];
export type ArtifactType =
  | 'input_manifest'
  | 'requirements'
  | 'creative_brief'
  | 'song_blueprint'
  | 'lyrics'
  | 'symbolic_score'
  | 'arrangement'
  | 'performance'
  | 'stem'
  | 'mix'
  | 'master'
  | 'review'
  | 'export'
  | 'source_media'
  | 'normalized_audio'
  | 'analysis'
  | 'audio_understanding'
  | 'preview';

export interface Project {
  schemaVersion: SchemaVersion;
  id: string;
  status: ProjectStatus;
  title?: string;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

export interface ArtifactIdentifier {
  artifactId: string;
  projectId: string;
  artifactType: ArtifactType;
  namespace: ArtifactNamespace;
  logicalName: string;
  version: number;
  schemaVersion: SchemaVersion;
}

export interface ArtifactDependency {
  artifactId: string;
  dependsOnArtifactId: string;
  kind: DependencyKind;
}

export interface HumanEditRecord {
  id: string;
  artifactId: string;
  editorId?: string;
  baseChecksum?: string;
  patch: Record<string, unknown> | unknown[];
  summary?: string;
  createdAt: string;
}

export interface Provenance {
  producer: string;
  producerVersion?: string;
  model?: string;
  modelVersion?: string;
  promptVersion?: string;
  sourceArtifactIds: string[];
  parameters: Record<string, unknown>;
  generatedAt: string;
}

export interface ArtifactEnvelope<TPayload> extends ArtifactIdentifier {
  status: ArtifactStatus;
  objectKey: string;
  mimeType: string;
  checksumSha256?: string;
  fileSize?: number;
  qualityScore?: number;
  parentArtifactId?: string;
  dependencies: ArtifactDependency[];
  provenance: Provenance;
  humanEdits: HumanEditRecord[];
  payload: TPayload;
  createdAt: string;
}

export interface InputManifest {
  inputs: Array<{ artifactId: string; role: string; mediaType: string }>;
  normalizationProfile?: { codec: string; sampleRate: number; channels: number };
}

export interface Requirements {
  language?: string;
  genre?: string;
  mood?: string;
  targetDurationSeconds?: number;
  constraints: string[];
}

export interface CreativeBrief {
  intent: string;
  audience?: string;
  themes: string[];
  references: string[];
}

export interface SongBlueprint {
  title: string;
  bpm: number;
  key: string;
  timeSignature: string;
  sections: Array<{ name: string; bars: number; energy?: number }>;
}

export interface Lyrics {
  language: string;
  sections: Array<{ section: string; lines: string[] }>;
  plainText: string;
}

export interface SymbolicScore {
  format: 'midi' | 'musicxml' | 'json';
  durationTicks?: number;
  tempoMap?: Array<{ tick: number; bpm: number }>;
}

export interface Arrangement {
  sections: Array<{ name: string; startSeconds: number; durationSeconds: number }>;
  tracks: Array<{ name: string; role: string; instrument?: string }>;
}

export interface Performance {
  performer: 'model' | 'human' | 'hybrid';
  instrumentOrVoice: string;
  take: number;
}

export interface Stem {
  role: string;
  durationMs: number;
  sampleRate: number;
  channels: number;
}

export interface Mix {
  stemArtifactIds: string[];
  durationMs: number;
  loudnessLufs?: number;
  truePeakDbtp?: number;
}

export interface Master {
  mixArtifactId: string;
  durationMs: number;
  loudnessLufs: number;
  truePeakDbtp: number;
}

export interface Review {
  subjectArtifactId?: string;
  decision: ReviewDecision;
  qualityScore?: number;
  notes?: string;
}

export interface Export {
  masterArtifactId: string;
  format: string;
  usage: 'download' | 'stream' | 'distribution';
}

export type ArtifactPayloadByType = {
  input_manifest: InputManifest;
  requirements: Requirements;
  creative_brief: CreativeBrief;
  song_blueprint: SongBlueprint;
  lyrics: Lyrics;
  symbolic_score: SymbolicScore;
  arrangement: Arrangement;
  performance: Performance;
  stem: Stem;
  mix: Mix;
  master: Master;
  review: Review;
  export: Export;
  source_media: Record<string, unknown>;
  normalized_audio: Record<string, unknown>;
  analysis: Record<string, unknown>;
  preview: Record<string, unknown>;
};
