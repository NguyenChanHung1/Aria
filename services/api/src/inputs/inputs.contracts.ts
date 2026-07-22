export const TEXT_INPUT_SCHEMA_VERSION = '1.1.0' as const;

export type TextInputKind = 'text' | 'lyrics';

export type TextInputManifest = {
  schemaVersion: typeof TEXT_INPUT_SCHEMA_VERSION;
  id: string;
  projectId: string;
  kind: TextInputKind;
  role?: string;
  purpose?: string;
  content: string;
  createdAt: string;
};
