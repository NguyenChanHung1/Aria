export const INGESTION_SCHEMA_VERSION = '1.0.0' as const;

export type MediaKind = 'audio' | 'video';
export type MediaPurpose = 'mixture' | 'voice';
export type FindingSeverity = 'warning' | 'error';

export type AudioStreamMetadata = {
  index: number;
  codec: string;
  sampleFormat?: string;
  sampleRate?: number;
  channels?: number;
  channelLayout?: string;
  bitRate?: number;
  durationSeconds?: number;
  tags: Record<string, string>;
};

export type ProbeMetadata = {
  formatNames: string[];
  formatLongName?: string;
  durationSeconds: number;
  bitRate?: number;
  streamCount: number;
  audioStreams: AudioStreamMetadata[];
  videoStreamCount: number;
  tags: Record<string, string>;
};

export type ValidationFinding = {
  code: string;
  severity: FindingSeverity;
  message: string;
  value?: number;
  threshold?: number;
};

export type QualityMetadata = {
  durationSeconds: number;
  meanVolumeDb?: number;
  peakVolumeDb?: number;
  clippingRatioEstimate?: number;
  silenceRatio: number;
};

export type NormalizationProfile = {
  id: 'working-stereo' | 'working-voice';
  container: 'wav';
  codec: 'pcm_s24le';
  sampleRate: 48000;
  channels: 1 | 2;
  sampleFormat: 's24';
};

export type ArtifactReference = {
  id: string;
  role: 'source' | 'working';
  ref: string;
  mediaType: string;
  bytes: number;
  sha256: string;
  profile?: NormalizationProfile;
  parentArtifactId?: string;
};

export type ToolProvenance = {
  ffmpegVersion: string;
  ffprobeVersion: string;
  ffmpegArguments: string[][];
};

export type InputManifest = {
  schemaVersion: typeof INGESTION_SCHEMA_VERSION;
  id: string;
  projectId: string;
  kind: MediaKind;
  purpose: MediaPurpose;
  createdAt: string;
  originalDisplayName: string;
  clientMediaType: string;
  detectedMediaType: string;
  selectedAudioStreamIndex: number;
  rawProbeRef: string;
  source: ArtifactReference;
  derived: ArtifactReference[];
  probe: ProbeMetadata;
  quality: QualityMetadata;
  findings: ValidationFinding[];
  tools: ToolProvenance;
};

export type IngestionResult = {
  manifest: InputManifest;
  manifestRef: string;
};
