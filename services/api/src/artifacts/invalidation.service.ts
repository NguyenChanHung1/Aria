import { Injectable, NotFoundException } from '@nestjs/common';
import { ArtifactStatus, ArtifactType } from '@prisma/client';
import { ArtifactRepository } from './artifact.repository';

const PROTECTED_FROM_SUPERSESSION = new Set<ArtifactType>([
  ArtifactType.SOURCE_MEDIA,
  ArtifactType.NORMALIZED_AUDIO,
]);

@Injectable()
export class InvalidationService {
  constructor(private readonly artifacts: ArtifactRepository) {}

  async markStaleDependents(projectId: string, rootArtifactId: string): Promise<string[]> {
    const dependents = await this.artifacts.collectDependents(projectId, rootArtifactId);
    const staleIds: string[] = [];
    for (const artifactId of dependents) {
      const artifact = await this.artifacts.getArtifact(artifactId);
      if (!artifact || artifact.projectId !== projectId) continue;
      if (PROTECTED_FROM_SUPERSESSION.has(artifact.type)) continue;
      if (artifact.logicalName.startsWith('acoustic-analysis-')) continue;
      if (artifact.logicalName.startsWith('audio-embeddings-')) continue;
      if (artifact.logicalName.startsWith('input-classification-')) continue;
      if (artifact.logicalName === 'raw-ffprobe') continue;
      if (artifact.status === ArtifactStatus.SUPERSEDED || artifact.status === ArtifactStatus.DELETED) continue;
      await this.artifacts.markSuperseded(artifactId);
      staleIds.push(artifactId);
    }
    return staleIds;
  }

  async lineage(projectId: string, artifactId: string) {
    const artifact = await this.artifacts.getArtifact(artifactId);
    if (!artifact || artifact.projectId !== projectId) throw new NotFoundException({ code: 'ARTIFACT_NOT_FOUND', message: 'Artifact not found' });
    const parents = await this.artifacts.getDirectDependencies(artifactId);
    const children = await this.artifacts.getDirectDependents(artifactId);
    return {
      artifactId,
      version: artifact.version,
      status: artifact.status.toLowerCase(),
      parents,
      children,
      provenance: artifact.provenance,
      lineage: {
        parentArtifactId: artifact.parentArtifactId,
        dependencyCount: parents.length,
        dependentCount: children.length,
      },
    };
  }
}
