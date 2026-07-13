import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ArtifactNamespace,
  ArtifactStatus,
  ArtifactType,
  DependencyKind,
  Prisma,
  ProjectStatus,
  RetentionClass,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { ARTIFACT_SCHEMA_VERSION } from './artifact.contracts';
import { artifactObjectKey } from './object-storage';

const namespaceValues = {
  ORIGINALS: 'originals',
  NORMALIZED_AUDIO: 'normalized-audio',
  ANALYSIS: 'analysis',
  REQUIREMENTS: 'requirements',
  CREATIVE_DIRECTION: 'creative-direction',
  BLUEPRINTS: 'blueprints',
  LYRICS: 'lyrics',
  SCORES: 'scores',
  ARRANGEMENTS: 'arrangements',
  PERFORMANCES: 'performances',
  STEMS: 'stems',
  MIXES: 'mixes',
  MASTERS: 'masters',
  REVIEWS: 'reviews',
  PREVIEWS: 'previews',
  EXPORTS: 'exports',
} as const;

export interface CreateArtifactVersionInput {
  projectId: string;
  type: ArtifactType;
  namespace: ArtifactNamespace;
  logicalName: string;
  fileName: string;
  mimeType: string;
  retentionClass: RetentionClass;
  expiresAt?: Date;
  parentArtifactId?: string;
  dependencies?: Array<{ artifactId: string; kind?: DependencyKind }>;
  schemaVersion?: string;
  pipelinePhase?: string;
  modelVersion?: string;
  promptVersion?: string;
  provenance?: Prisma.InputJsonObject;
  payload?: Prisma.InputJsonObject;
}

@Injectable()
export class ArtifactRepository {
  constructor(private readonly prisma: PrismaService) {}

  createProject(input: { id?: string; title?: string; metadata?: Prisma.InputJsonObject } = {}) {
    return this.prisma.project.create({ data: {
      ...(input.id ? { id: input.id } : {}),
      schemaVersion: ARTIFACT_SCHEMA_VERSION,
      status: ProjectStatus.DRAFT,
      ...(input.title ? { title: input.title } : {}),
      metadata: input.metadata ?? {},
    } });
  }

  getProject(id: string) {
    return this.prisma.project.findUnique({ where: { id }, include: { artifacts: { orderBy: { createdAt: 'asc' } } } });
  }

  async createArtifactVersion(input: CreateArtifactVersionInput) {
    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.findUnique({ where: { id: input.projectId }, select: { id: true } });
      if (!project) throw new NotFoundException('Project not found');
      const versionLock = `${input.projectId}:${input.type}:${input.logicalName}`;
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${versionLock}))`);

      const relationIds = [...new Set([
        ...(input.parentArtifactId ? [input.parentArtifactId] : []),
        ...(input.dependencies ?? []).map((dependency) => dependency.artifactId),
      ])];
      if (relationIds.length) {
        const relationCount = await tx.artifact.count({ where: { id: { in: relationIds }, projectId: input.projectId } });
        if (relationCount !== relationIds.length) throw new ConflictException('Artifact lineage must remain within one project');
      }

      const latest = await tx.artifact.findFirst({
        where: { projectId: input.projectId, type: input.type, logicalName: input.logicalName },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const id = randomUUID();
      const version = (latest?.version ?? 0) + 1;
      const objectKey = artifactObjectKey({
        projectId: input.projectId,
        namespace: namespaceValues[input.namespace],
        artifactId: id,
        fileName: input.fileName,
      });
      const artifact = await tx.artifact.create({ data: {
        id,
        projectId: input.projectId,
        type: input.type,
        namespace: input.namespace,
        logicalName: input.logicalName,
        version,
        schemaVersion: input.schemaVersion ?? ARTIFACT_SCHEMA_VERSION,
        status: ArtifactStatus.PENDING,
        objectKey,
        mimeType: input.mimeType,
        retentionClass: input.retentionClass,
        ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
        ...(input.parentArtifactId ? { parentArtifactId: input.parentArtifactId } : {}),
        ...(input.pipelinePhase ? { pipelinePhase: input.pipelinePhase } : {}),
        ...(input.modelVersion ? { modelVersion: input.modelVersion } : {}),
        ...(input.promptVersion ? { promptVersion: input.promptVersion } : {}),
        provenance: input.provenance ?? {},
        payload: input.payload ?? {},
      } });

      if (input.dependencies?.length) {
        await tx.artifactDependency.createMany({ data: input.dependencies.map((dependency) => ({
          artifactId: artifact.id,
          dependsOnId: dependency.artifactId,
          kind: dependency.kind ?? DependencyKind.REQUIRES,
        })) });
      }
      return artifact;
    });
  }

  async markAvailable(id: string, metadata: { checksumSha256: string; fileSize: bigint; durationMs?: number; sampleRate?: number; channels?: number; qualityScore?: Prisma.Decimal }) {
    return this.prisma.artifact.update({ where: { id }, data: { ...metadata, status: ArtifactStatus.AVAILABLE } });
  }

  async addHumanEdit(input: { artifactId: string; editorId?: string; baseChecksum?: string; patch: Prisma.InputJsonValue; summary?: string }) {
    return this.prisma.humanEdit.create({ data: input });
  }

  async protectivelyDelete(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const artifact = await tx.artifact.findUnique({ where: { id }, select: { retentionClass: true, status: true } });
      if (!artifact) throw new NotFoundException('Artifact not found');
      if (artifact.retentionClass === RetentionClass.ORIGINAL || artifact.retentionClass === RetentionClass.FINAL) {
        throw new ConflictException('Original and final artifacts are retention protected');
      }
      const [children, dependents] = await Promise.all([
        tx.artifact.count({ where: { parentArtifactId: id, status: { not: ArtifactStatus.DELETED } } }),
        tx.artifactDependency.count({ where: { dependsOnId: id, artifact: { status: { not: ArtifactStatus.DELETED } } } }),
      ]);
      if (children + dependents > 0) throw new ConflictException('Artifact is referenced by active descendants');
      await tx.artifact.update({ where: { id }, data: { status: ArtifactStatus.DELETED } });
    });
  }
}
