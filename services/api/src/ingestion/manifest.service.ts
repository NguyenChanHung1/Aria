import { Injectable } from '@nestjs/common';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { IngestionStorageService } from './storage.service';
import type { InputManifest } from './ingestion.contracts';

@Injectable()
export class ManifestService {
  constructor(private readonly storage: IngestionStorageService) {}

  async persist(manifest: InputManifest): Promise<{ ref: string; filePath: string }> {
    const relativePath = path.join('analysis', `input-manifest-${manifest.id}.json`);
    const finalPath = path.join(this.storage.projectDirectory(manifest.projectId), relativePath);
    const temporaryPath = this.storage.temporaryArtifact(finalPath);
    await writeFile(temporaryPath, JSON.stringify(manifest, null, 2), { flag: 'wx' });
    await this.storage.publish(temporaryPath, finalPath);
    return { ref: `artifact:${manifest.id}`, filePath: finalPath };
  }

  async persistRawProbe(projectId: string, artifactId: string, raw: string): Promise<{ ref: string; filePath: string }> {
    const relativePath = path.join('analysis', `ffprobe-${artifactId}.json`);
    const finalPath = path.join(this.storage.projectDirectory(projectId), relativePath);
    const temporaryPath = this.storage.temporaryArtifact(finalPath);
    await writeFile(temporaryPath, raw, { flag: 'wx' });
    await this.storage.publish(temporaryPath, finalPath);
    return { ref: `artifact:${artifactId}`, filePath: finalPath };
  }
}
