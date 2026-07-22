export const UNDERSTANDING_SCHEMA_VERSION = '3.0.0' as const;

export type ModuleStatus = 'complete' | 'partial' | 'abstained' | 'failed';
export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'none';

export interface ModuleResult {
  status: ModuleStatus;
  artifactId?: string;
  confidence: ConfidenceLevel;
  summary: Record<string, unknown>;
  warnings: string[];
}

export interface TempoDescriptor {
  bpm: number;
  confidence: ConfidenceLevel;
  candidates?: Array<{ bpm: number; strength: number }>;
}

export interface KeyDescriptor {
  root: string;
  mode: 'major' | 'minor' | 'unknown';
  confidence: ConfidenceLevel;
}

export interface UnderstandingSection {
  id: string;
  startSeconds: number;
  endSeconds: number;
  label?: string;
  tempo?: TempoDescriptor;
  key?: KeyDescriptor;
  energy?: number;
  semanticTags?: string[];
}

export interface AudioUnderstanding {
  schemaVersion: typeof UNDERSTANDING_SCHEMA_VERSION;
  inputId: string;
  version: number;
  global: {
    durationSeconds: number;
    tempo?: TempoDescriptor;
    key?: KeyDescriptor;
    timeSignature?: { numerator: number; denominator: number; confidence: ConfidenceLevel };
    loudness?: { integratedLufs?: number; samplePeakDbfs?: number };
    semanticTags: string[];
  };
  sections: UnderstandingSection[];
  modules: {
    separation?: ModuleResult;
    transcription?: ModuleResult;
    timing: ModuleResult;
    melody: ModuleResult;
    harmony: ModuleResult;
    structure: ModuleResult;
    timbre: ModuleResult;
    texture: ModuleResult;
    semantic: ModuleResult;
  };
  fusion: {
    uncertainties: Array<{ field: string; reason: string; moduleIds: string[] }>;
    conflicts: Array<{ field: string; values: unknown[] }>;
  };
  lineage: {
    inputId: string;
    workingArtifactId: string;
    interpretationArtifactId: string;
    interpretationVersion: number;
    sourceArtifactIds: string[];
  };
  createdAt: string;
}

export interface UnderstandingSummary {
  artifactId: string;
  version: number;
  inputId: string;
  stale: boolean;
  createdAt: string;
  interpretationArtifactId: string;
  interpretationVersion: number;
  workingArtifactId: string;
  global: AudioUnderstanding['global'];
  sectionCount: number;
  modules: Record<string, { status: ModuleStatus; confidence: ConfidenceLevel; warnings: string[] }>;
  fusion: AudioUnderstanding['fusion'];
  download?: { url: string; expiresAt: string; checksumSha256?: string };
}

export interface WorkerUnderstandResult {
  understanding: { checksumSha256: string; fileSize: number; payload: AudioUnderstanding };
  modules: Record<string, { checksumSha256: string; fileSize: number; payload: Record<string, unknown> }>;
  workflowStatus: 'succeeded' | 'partial' | 'failed';
}

export const APPROVED_INTERPRETATION_STATUSES = ['auto_accepted', 'user_confirmed', 'user_corrected'] as const;

export const UNDERSTANDING_MODULE_NAMES = [
  'separation',
  'transcription',
  'timing',
  'melody',
  'harmony',
  'structure',
  'timbre',
  'texture',
  'semantic',
] as const;

export type UnderstandingModuleName = typeof UNDERSTANDING_MODULE_NAMES[number];
