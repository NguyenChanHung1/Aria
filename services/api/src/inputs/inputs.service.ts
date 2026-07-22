import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ArtifactNamespace, ArtifactType, DependencyKind, Prisma, ProjectStatus, RetentionClass } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { ArtifactRepository } from '../artifacts/artifact.repository';
import { ObjectStorage } from '../artifacts/object-storage';
import { TEXT_INPUT_SCHEMA_VERSION, type TextInputKind, type TextInputManifest } from './inputs.contracts';

@Injectable()
export class InputsService {
  constructor(private readonly artifacts: ArtifactRepository, private readonly objects: ObjectStorage) {}

  async createTextInput(projectId: string, body: Record<string, unknown>) {
    const project = await this.artifacts.getProject(projectId);
    if (!project) throw new NotFoundException({ code: 'PROJECT_NOT_FOUND', message: 'Project not found' });
    const kind = this.kind(body.kind);
    const content = this.content(body.content);
    const role = this.optionalText(body.role, 'role');
    const purpose = this.optionalText(body.purpose, 'purpose');
    const manifestId = randomUUID();
    const manifest: TextInputManifest = {
      schemaVersion: TEXT_INPUT_SCHEMA_VERSION,
      id: manifestId,
      projectId,
      kind,
      ...(role ? { role } : {}),
      ...(purpose ? { purpose } : {}),
      content,
      createdAt: new Date().toISOString(),
    };
    const bytes = Buffer.from(JSON.stringify(manifest, null, 2));
    const artifact = await this.artifacts.createArtifactVersion({
      id: manifestId,
      projectId,
      type: ArtifactType.INPUT_MANIFEST,
      namespace: ArtifactNamespace.ANALYSIS,
      logicalName: `${kind}-input`,
      fileName: 'input-manifest.json',
      mimeType: 'application/json',
      retentionClass: RetentionClass.INTERMEDIATE,
      pipelinePhase: 'ingestion',
      provenance: {
        producer: 'aria-api-inputs',
        producerVersion: '1.0.0',
        sourceArtifactIds: [],
        parameters: { kind },
        generatedAt: manifest.createdAt,
      },
      payload: { kind, textInput: true } as Prisma.InputJsonObject,
    });
    await this.objects.putBytes(artifact.objectKey, bytes, artifact.mimeType);
    await this.artifacts.markAvailable(artifact.id, {
      checksumSha256: createHash('sha256').update(bytes).digest('hex'),
      fileSize: BigInt(bytes.length),
      payload: { kind, textInput: true, contentLength: content.length } as Prisma.InputJsonObject,
    });
    const metadata = project.metadata as Record<string, unknown>;
    await this.artifacts.updateProjectState(projectId, project.status === ProjectStatus.DRAFT ? ProjectStatus.ACTIVE : project.status, {
      ...metadata,
      stage: 'input_ready',
      inputId: manifestId,
      inputKind: kind,
    });
    return { input: { id: manifestId, kind, role: role ?? null, purpose: purpose ?? null, manifestRef: `artifact:${manifestId}` }, manifest };
  }

  private kind(value: unknown): TextInputKind {
    if (value !== 'text' && value !== 'lyrics') throw new BadRequestException({ code: 'INVALID_INPUT', message: 'kind must be text or lyrics' });
    return value;
  }

  private content(value: unknown): string {
    if (typeof value !== 'string') throw new BadRequestException({ code: 'INVALID_INPUT', message: 'content must be a string' });
    const trimmed = value.trim();
    if (trimmed.length < 1) throw new BadRequestException({ code: 'INVALID_INPUT', message: 'content must not be empty' });
    if (trimmed.length > 50_000) throw new BadRequestException({ code: 'INVALID_INPUT', message: 'content must contain 50000 characters or fewer' });
    return trimmed;
  }

  private optionalText(value: unknown, field: string): string | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'string' || !value.trim()) throw new BadRequestException({ code: 'INVALID_INPUT', message: `${field} must be a non-empty string when provided` });
    return value.trim().slice(0, 200);
  }
}
