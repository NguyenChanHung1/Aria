import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class InterpretationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async get(projectId: string, inputId: string) {
    const head = await this.prisma.inputInterpretationHead.findUnique({
      where: { inputManifestId: inputId }, include: { activeArtifact: true, inputManifest: true },
    });
    if (!head || head.inputManifest.projectId !== projectId) throw new NotFoundException('Input interpretation not found');
    return head;
  }

  createInitial(inputId: string, artifactId: string) {
    return this.prisma.inputInterpretationHead.create({ data: { inputManifestId: inputId, activeArtifactId: artifactId, version: 1 } });
  }

  async advance(input: { projectId: string; inputId: string; baseVersion: number; artifactId: string; editorId: string; patch: Prisma.InputJsonValue; summary?: string }) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.inputInterpretationHead.findUnique({ where: { inputManifestId: input.inputId }, include: { inputManifest: true } });
      if (!current || current.inputManifest.projectId !== input.projectId) throw new NotFoundException('Input interpretation not found');
      if (current.version !== input.baseVersion) throw new ConflictException('Interpretation has changed; refresh and retry');
      const moved = await tx.inputInterpretationHead.updateMany({
        where: { inputManifestId: input.inputId, version: input.baseVersion },
        data: { activeArtifactId: input.artifactId, version: input.baseVersion + 1 },
      });
      if (moved.count !== 1) throw new ConflictException('Interpretation has changed; refresh and retry');
      await tx.humanEdit.create({ data: { artifactId: input.artifactId, editorId: input.editorId, patch: input.patch, ...(input.summary ? { summary: input.summary } : {}) } });
      return tx.inputInterpretationHead.findUniqueOrThrow({ where: { inputManifestId: input.inputId }, include: { activeArtifact: true } });
    });
  }

  history(projectId: string, inputId: string) {
    return this.prisma.artifact.findMany({
      where: { projectId, logicalName: `input-interpretation-${inputId}` }, orderBy: { version: 'asc' },
      select: { id: true, version: true, payload: true, createdAt: true, edits: { select: { summary: true, createdAt: true } } },
    });
  }

  async markProjectInterpreted(projectId: string, version: number) {
    const project = await this.prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { metadata: true } });
    const metadata = project.metadata as Prisma.InputJsonObject;
    return this.prisma.project.update({ where: { id: projectId }, data: { metadata: { ...metadata, stage: 'input_interpreted', interpretationVersion: version } } });
  }
}
