import { Injectable } from '@nestjs/common';
import path from 'node:path';
import { ProcessRunnerService } from './process-runner.service';
import { ProbeService } from './probe.service';
import { IngestionException } from './ingestion.exception';
import type { MediaPurpose, NormalizationProfile, ProbeMetadata } from './ingestion.contracts';

export const COMPATIBILITY_PROFILE: NormalizationProfile = {
  id: 'generator-compatibility', container: 'wav', codec: 'pcm_s16le', sampleRate: 44100, channels: 1, sampleFormat: 's16',
};

export function workingProfile(purpose: MediaPurpose): NormalizationProfile {
  return purpose === 'voice'
    ? { id: 'working-voice', container: 'wav', codec: 'pcm_s24le', sampleRate: 48000, channels: 1, sampleFormat: 's24' }
    : { id: 'working-stereo', container: 'wav', codec: 'pcm_s24le', sampleRate: 48000, channels: 2, sampleFormat: 's24' };
}

@Injectable()
export class NormalizerService {
  constructor(private readonly runner: ProcessRunnerService, private readonly probe: ProbeService) {}

  async normalize(
    sourcePath: string,
    selectedStreamIndex: number,
    outputPath: string,
    profile: NormalizationProfile,
    signal?: AbortSignal,
  ): Promise<string[]> {
    const args = [
      '-nostdin', '-y', '-v', 'error', '-i', sourcePath,
      '-map', `0:${selectedStreamIndex}`, '-vn', '-map_metadata', '-1',
      '-af', 'aresample=async=0:first_pts=0',
      '-ac', String(profile.channels), '-ar', String(profile.sampleRate),
      '-c:a', profile.codec, '-f', 'wav', outputPath,
    ];
    await this.runner.run('ffmpeg', args, signal);
    const outputProbe = await this.probe.inspect(outputPath, signal);
    this.verify(outputProbe, profile, path.basename(outputPath));
    return args;
  }

  async version(signal?: AbortSignal): Promise<string> {
    const { stdout } = await this.runner.run('ffmpeg', ['-version'], signal);
    return stdout.split('\n')[0]?.trim() || 'ffmpeg unknown';
  }

  private verify(probe: ProbeMetadata, profile: NormalizationProfile, outputName: string): void {
    const stream = probe.audioStreams[0];
    if (!stream || stream.codec !== profile.codec || stream.sampleRate !== profile.sampleRate || stream.channels !== profile.channels) {
      throw new IngestionException('NORMALIZATION_MISMATCH', `Normalized output ${outputName} does not match its required profile`);
    }
  }
}
