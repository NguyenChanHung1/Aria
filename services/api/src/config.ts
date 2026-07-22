import { mkdir } from 'node:fs/promises';
import path from 'node:path';

export const config = {
  port: Number(process.env.API_PORT ?? 8010),
  storageDir: process.env.MEDIA_STORAGE_DIR ?? path.resolve(process.cwd(), 'outputs'),
  tempDir: process.env.MEDIA_TEMP_DIR ?? path.resolve(process.env.MEDIA_STORAGE_DIR ?? path.resolve(process.cwd(), 'outputs'), '.tmp'),
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES ?? 250 * 1024 * 1024),
  maxMediaDurationSeconds: Number(process.env.MAX_MEDIA_DURATION_SECONDS ?? 30 * 60),
  maxMediaStreams: Number(process.env.MAX_MEDIA_STREAMS ?? 16),
  mediaProcessTimeoutMs: Number(process.env.MEDIA_PROCESS_TIMEOUT_MS ?? 120_000),
  silenceThresholdDb: Number(process.env.MEDIA_SILENCE_THRESHOLD_DB ?? -60),
  clippingWarningDb: Number(process.env.MEDIA_CLIPPING_WARNING_DB ?? -0.1),
  maxClippingRatio: Number(process.env.MEDIA_MAX_CLIPPING_RATIO ?? 0.01),
  objectStorage: {
    endpoint: process.env.OBJECT_STORAGE_ENDPOINT ?? 'http://localhost:9000',
    publicEndpoint: process.env.OBJECT_STORAGE_PUBLIC_ENDPOINT ?? process.env.OBJECT_STORAGE_ENDPOINT ?? 'http://localhost:9000',
    region: process.env.OBJECT_STORAGE_REGION ?? 'us-east-1',
    bucket: process.env.OBJECT_STORAGE_BUCKET ?? 'aria-artifacts',
    accessKey: process.env.OBJECT_STORAGE_ACCESS_KEY ?? 'aria-minio',
    secretKey: process.env.OBJECT_STORAGE_SECRET_KEY ?? 'aria-minio-development',
    forcePathStyle: (process.env.OBJECT_STORAGE_FORCE_PATH_STYLE ?? 'true') === 'true',
    signedUrlTtlSeconds: Number(process.env.OBJECT_STORAGE_SIGNED_URL_TTL_SECONDS ?? 900),
  },
  analysis: {
    enabled: (process.env.ANALYSIS_ENABLED ?? 'false') === 'true',
    url: process.env.ANALYSIS_WORKER_URL ?? 'http://analysis:8020',
    timeoutMs: Number(process.env.ANALYSIS_TIMEOUT_MS ?? 300_000),
    mandatoryReview: (process.env.ANALYSIS_MANDATORY_REVIEW ?? 'false') === 'true',
  },
  understanding: {
    enabled: (process.env.UNDERSTANDING_ENABLED ?? process.env.ANALYSIS_ENABLED ?? 'false') === 'true',
    timeoutMs: Number(process.env.UNDERSTANDING_TIMEOUT_MS ?? 600_000),
    optionalModules: (process.env.UNDERSTANDING_OPTIONAL_MODULES ?? 'separation,transcription').split(',').map((item) => item.trim()).filter(Boolean),
  },
};

export async function ensureStorage(): Promise<void> {
  await Promise.all([
    mkdir(config.storageDir, { recursive: true }),
    mkdir(config.tempDir, { recursive: true }),
  ]);
}
