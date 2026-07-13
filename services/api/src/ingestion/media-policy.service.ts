import { HttpStatus, Injectable } from '@nestjs/common';
import path from 'node:path';
import { config } from '../config';
import { IngestionException } from './ingestion.exception';
import type { MediaKind, MediaPurpose, ProbeMetadata, ValidationFinding } from './ingestion.contracts';

const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg', '.oga', '.opus', '.wma']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv', '.mpeg', '.mpg', '.avi']);
const AUDIO_CODECS = new Set([
  'aac', 'alac', 'flac', 'mp3', 'opus', 'vorbis',
  'pcm_f32le', 'pcm_f64le', 'pcm_s16be', 'pcm_s16le', 'pcm_s24be', 'pcm_s24le', 'pcm_s32be', 'pcm_s32le',
  'pcm_u8', 'wmav1', 'wmav2',
]);

@Injectable()
export class MediaPolicyService {
  validateUpload(file: Express.Multer.File): void {
    if (!file?.path || file.size <= 0) throw new IngestionException('MEDIA_REQUIRED', 'An audio or video file is required');
    if (file.size > config.maxUploadBytes) {
      throw new IngestionException('UPLOAD_TOO_LARGE', `Upload exceeds ${config.maxUploadBytes} bytes`, HttpStatus.PAYLOAD_TOO_LARGE);
    }
    if (!file.originalname || file.originalname.length > 255) {
      throw new IngestionException('INVALID_FILENAME', 'The uploaded filename is missing or too long');
    }
    const extension = path.extname(file.originalname).toLowerCase();
    if (!AUDIO_EXTENSIONS.has(extension) && !VIDEO_EXTENSIONS.has(extension)) {
      throw new IngestionException('UNSUPPORTED_EXTENSION', 'Supported uploads are MP3, WAV, FLAC, AAC, M4A, OGG, WMA, MP4, MOV, WebM, MKV, MPEG, and AVI');
    }
    if (file.mimetype && !file.mimetype.startsWith('audio/') && !file.mimetype.startsWith('video/') && file.mimetype !== 'application/octet-stream') {
      throw new IngestionException('UNSUPPORTED_MEDIA_TYPE', 'The upload must declare an audio or video media type');
    }
  }

  validateProbe(file: Express.Multer.File, probe: ProbeMetadata): { kind: MediaKind; selectedAudioStreamIndex: number; findings: ValidationFinding[] } {
    if (probe.streamCount > config.maxMediaStreams) {
      throw new IngestionException('TOO_MANY_STREAMS', `Media contains more than ${config.maxMediaStreams} streams`);
    }
    if (!probe.audioStreams.length) throw new IngestionException('NO_AUDIO_STREAM', 'No audio stream was found in the upload');
    if (!Number.isFinite(probe.durationSeconds) || probe.durationSeconds <= 0) {
      throw new IngestionException('INVALID_DURATION', 'The uploaded media has no playable duration');
    }
    if (probe.durationSeconds > config.maxMediaDurationSeconds) {
      throw new IngestionException('MEDIA_TOO_LONG', `Media exceeds the ${config.maxMediaDurationSeconds} second duration limit`);
    }
    const selected = probe.audioStreams[0];
    if (!AUDIO_CODECS.has(selected.codec)) {
      throw new IngestionException('UNSUPPORTED_AUDIO_CODEC', `Audio codec ${selected.codec || 'unknown'} is not supported`);
    }
    const kind: MediaKind = probe.videoStreamCount > 0 ? 'video' : 'audio';
    if (file.mimetype?.startsWith('audio/') && kind === 'video') {
      throw new IngestionException('MEDIA_TYPE_MISMATCH', 'The declared audio upload contains a video stream');
    }
    return { kind, selectedAudioStreamIndex: selected.index, findings: [] };
  }

  purpose(value: unknown): MediaPurpose {
    if (value === undefined || value === '' || value === 'mixture') return 'mixture';
    if (value === 'voice') return 'voice';
    throw new IngestionException('INVALID_MEDIA_PURPOSE', 'media_purpose must be either mixture or voice');
  }

  extensionFor(probe: ProbeMetadata, kind: MediaKind): string {
    if (kind === 'video') {
      if (probe.formatNames.includes('matroska') || probe.formatNames.includes('webm')) return probe.formatNames.includes('webm') ? '.webm' : '.mkv';
      if (probe.formatNames.includes('mov') || probe.formatNames.includes('mp4')) return '.mp4';
    }
    const codec = probe.audioStreams[0]?.codec;
    if (codec === 'mp3') return '.mp3';
    if (codec === 'flac') return '.flac';
    if (codec === 'aac') return probe.formatNames.includes('aac') ? '.aac' : '.m4a';
    if (codec === 'opus' || codec === 'vorbis') return '.ogg';
    return '.wav';
  }

  detectedMediaType(probe: ProbeMetadata, kind: MediaKind): string {
    if (kind === 'video') return probe.formatNames.includes('webm') ? 'video/webm' : 'video/mp4';
    const codec = probe.audioStreams[0]?.codec;
    if (codec === 'aac') return probe.formatNames.includes('aac') ? 'audio/aac' : 'audio/mp4';
    return ({ mp3: 'audio/mpeg', flac: 'audio/flac', opus: 'audio/ogg', vorbis: 'audio/ogg', wmav1: 'audio/x-ms-wma', wmav2: 'audio/x-ms-wma' } as Record<string, string>)[codec] ?? 'audio/wav';
  }
}
