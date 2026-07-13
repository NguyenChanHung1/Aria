import { Injectable } from '@nestjs/common';
import { config } from '../config';
import { ProcessRunnerService } from './process-runner.service';
import { IngestionException } from './ingestion.exception';
import type { ProbeMetadata, QualityMetadata, ValidationFinding } from './ingestion.contracts';

function matchNumber(text: string, pattern: RegExp): number | undefined {
  const value = Number(text.match(pattern)?.[1]);
  return Number.isFinite(value) ? value : undefined;
}

@Injectable()
export class QualityService {
  constructor(private readonly runner: ProcessRunnerService) {}

  async analyze(filePath: string, streamIndex: number, probe: ProbeMetadata, signal?: AbortSignal): Promise<{ quality: QualityMetadata; findings: ValidationFinding[] }> {
    const { stderr } = await this.runner.run('ffmpeg', [
      '-nostdin', '-v', 'info', '-i', filePath, '-map', `0:${streamIndex}`,
      '-af', `astats=metadata=0:reset=0,volumedetect,silencedetect=noise=${config.silenceThresholdDb}dB:d=0.25`,
      '-f', 'null', '-',
    ], signal);
    const meanVolumeDb = matchNumber(stderr, /mean_volume:\s*(-?[\d.]+) dB/i);
    const peakVolumeDb = matchNumber(stderr, /max_volume:\s*(-?[\d.]+) dB/i);
    const peakCount = matchNumber(stderr, /Peak count:\s*([\d.]+)/i) ?? 0;
    const sampleCount = matchNumber(stderr, /Number of samples:\s*([\d.]+)/i) ?? 0;
    const clippingRatioEstimate = peakVolumeDb !== undefined && peakVolumeDb >= config.clippingWarningDb && sampleCount > 0
      ? Math.min(1, peakCount / sampleCount)
      : 0;
    const duration = probe.durationSeconds;
    let silentSeconds = 0;
    for (const match of stderr.matchAll(/silence_duration:\s*([\d.]+)/g)) silentSeconds += Number(match[1]);
    const openSilence = stderr.match(/silence_start:\s*([\d.]+)(?![\s\S]*silence_end)/);
    if (openSilence) silentSeconds += Math.max(0, duration - Number(openSilence[1]));
    const silenceRatio = Math.min(1, Math.max(0, silentSeconds / duration));
    if (silenceRatio >= 0.995 || meanVolumeDb === undefined || meanVolumeDb <= config.silenceThresholdDb) {
      throw new IngestionException('SILENCE_ONLY', 'The uploaded media contains no usable audible signal');
    }
    const findings: ValidationFinding[] = [];
    if (peakVolumeDb !== undefined && peakVolumeDb >= config.clippingWarningDb) {
      findings.push({
        code: 'POSSIBLE_CLIPPING', severity: 'warning',
        message: 'The upload reaches digital peak and may contain clipping',
        value: peakVolumeDb, threshold: config.clippingWarningDb,
      });
    }
    if (clippingRatioEstimate > config.maxClippingRatio) {
      throw new IngestionException('EXCESSIVE_CLIPPING', 'The upload contains too much clipped audio to process reliably');
    }
    return {
      quality: {
        durationSeconds: duration,
        meanVolumeDb,
        peakVolumeDb,
        clippingRatioEstimate,
        silenceRatio,
      },
      findings,
    };
  }
}
