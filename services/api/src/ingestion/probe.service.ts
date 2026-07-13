import { Injectable } from '@nestjs/common';
import { ProcessRunnerService } from './process-runner.service';
import { IngestionException } from './ingestion.exception';
import type { AudioStreamMetadata, ProbeMetadata } from './ingestion.contracts';

type FfprobeStream = {
  index?: number;
  codec_type?: string;
  codec_name?: string;
  sample_fmt?: string;
  sample_rate?: string;
  channels?: number;
  channel_layout?: string;
  bit_rate?: string;
  duration?: string;
  tags?: Record<string, unknown>;
};

type FfprobeDocument = {
  streams?: FfprobeStream[];
  format?: {
    format_name?: string;
    format_long_name?: string;
    duration?: string;
    bit_rate?: string;
    tags?: Record<string, unknown>;
  };
};

function finiteNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stringTags(value: Record<string, unknown> | undefined): Record<string, string> {
  return Object.fromEntries(Object.entries(value ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}

export function parseProbeDocument(document: FfprobeDocument): ProbeMetadata {
  const streams = Array.isArray(document.streams) ? document.streams : [];
  const audioStreams: AudioStreamMetadata[] = streams
    .filter((stream) => stream.codec_type === 'audio')
    .map((stream) => ({
      index: finiteNumber(stream.index) ?? 0,
      codec: stream.codec_name ?? '',
      sampleFormat: stream.sample_fmt,
      sampleRate: finiteNumber(stream.sample_rate),
      channels: finiteNumber(stream.channels),
      channelLayout: stream.channel_layout,
      bitRate: finiteNumber(stream.bit_rate),
      durationSeconds: finiteNumber(stream.duration),
      tags: stringTags(stream.tags),
    }));
  const streamDuration = Math.max(0, ...audioStreams.map((stream) => stream.durationSeconds ?? 0));
  return {
    formatNames: (document.format?.format_name ?? '').split(',').map((name) => name.trim()).filter(Boolean),
    formatLongName: document.format?.format_long_name,
    durationSeconds: finiteNumber(document.format?.duration) ?? streamDuration,
    bitRate: finiteNumber(document.format?.bit_rate),
    streamCount: streams.length,
    audioStreams,
    videoStreamCount: streams.filter((stream) => stream.codec_type === 'video').length,
    tags: stringTags(document.format?.tags),
  };
}

@Injectable()
export class ProbeService {
  constructor(private readonly runner: ProcessRunnerService) {}

  async inspect(filePath: string, signal?: AbortSignal): Promise<ProbeMetadata> {
    return (await this.inspectDetailed(filePath, signal)).metadata;
  }

  async inspectDetailed(filePath: string, signal?: AbortSignal): Promise<{ metadata: ProbeMetadata; raw: string }> {
    const { stdout } = await this.runner.run('ffprobe', [
      '-v', 'error', '-show_format', '-show_streams', '-of', 'json', filePath,
    ], signal);
    try {
      return { metadata: parseProbeDocument(JSON.parse(stdout) as FfprobeDocument), raw: stdout };
    } catch {
      throw new IngestionException('INVALID_PROBE_OUTPUT', 'The server could not read media metadata');
    }
  }

  async version(signal?: AbortSignal): Promise<string> {
    const { stdout } = await this.runner.run('ffprobe', ['-version'], signal);
    return stdout.split('\n')[0]?.trim() || 'ffprobe unknown';
  }
}
