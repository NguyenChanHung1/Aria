import { Injectable } from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { config } from '../config';

@Injectable()
export class IngestionStorageService {
  projectDirectory(projectId: string): string {
    return path.join(config.storageDir, 'projects', projectId);
  }

  artifactRef(projectId: string, relativePath: string): string {
    return `projects/${projectId}/${relativePath.split(path.sep).join('/')}`;
  }

  async prepare(projectId: string): Promise<void> {
    const root = this.projectDirectory(projectId);
    await Promise.all([
      mkdir(path.join(root, 'source-media'), { recursive: true }),
      mkdir(path.join(root, 'normalized-audio'), { recursive: true }),
      mkdir(path.join(root, 'analysis'), { recursive: true }),
    ]);
  }

  async preserveSource(projectId: string, temporaryPath: string, assetId: string, extension: string): Promise<string> {
    const destination = path.join(this.projectDirectory(projectId), 'source-media', `${assetId}${extension}`);
    await rename(temporaryPath, destination);
    return destination;
  }

  temporaryArtifact(finalPath: string): string {
    return `${finalPath}.${randomUUID()}.tmp`;
  }

  async publish(temporaryPath: string, finalPath: string): Promise<void> {
    await rename(temporaryPath, finalPath);
  }

  async sha256(filePath: string): Promise<string> {
    const hash = createHash('sha256');
    await new Promise<void>((resolve, reject) => {
      const input = createReadStream(filePath);
      input.on('data', (chunk) => hash.update(chunk));
      input.on('error', reject);
      input.on('end', resolve);
    });
    return hash.digest('hex');
  }

  async bytes(filePath: string): Promise<number> {
    return (await stat(filePath)).size;
  }

  async cleanup(...paths: Array<string | undefined>): Promise<void> {
    await Promise.all(paths.filter((item): item is string => Boolean(item)).map((item) => rm(item, { force: true, recursive: false }).catch(() => undefined)));
  }
}
