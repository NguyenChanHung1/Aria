import { Injectable } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { config } from '../config';
import { IngestionException } from './ingestion.exception';

export type ProcessResult = { stdout: string; stderr: string };

@Injectable()
export class ProcessRunnerService {
  run(command: string, args: string[], signal?: AbortSignal): Promise<ProcessResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      let settled = false;
      const append = (current: string, chunk: Buffer): string => (current + chunk.toString()).slice(-1_000_000);

      const finish = (error?: Error, result?: ProcessResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        if (error) reject(error);
        else resolve(result ?? { stdout, stderr });
      };
      const abort = () => {
        child.kill('SIGKILL');
        finish(new IngestionException('INGESTION_CANCELLED', 'Media ingestion was cancelled'));
      };
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        finish(new IngestionException('MEDIA_PROCESS_TIMEOUT', 'Media inspection or conversion timed out'));
      }, config.mediaProcessTimeoutMs);

      child.stdout.on('data', (chunk: Buffer) => (stdout = append(stdout, chunk)));
      child.stderr.on('data', (chunk: Buffer) => (stderr = append(stderr, chunk)));
      child.on('error', (error: NodeJS.ErrnoException) => {
        const code = error.code === 'ENOENT' ? 'MEDIA_TOOL_UNAVAILABLE' : 'MEDIA_PROCESS_FAILED';
        finish(new IngestionException(code, 'The server could not inspect or convert this media'));
      });
      child.on('close', (code) => {
        if (code === 0) finish(undefined, { stdout, stderr });
        else finish(new IngestionException('MEDIA_PROCESS_FAILED', 'The uploaded media could not be decoded'));
      });
      if (signal?.aborted) abort();
      else signal?.addEventListener('abort', abort, { once: true });
    });
  }
}
