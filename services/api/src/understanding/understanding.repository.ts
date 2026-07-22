import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class UnderstandingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getHead(projectId: string, inputId: string) {
    const head = await this.prisma.audioUnderstandingHead.findUnique({
      where: { inputManifestId: inputId },
      include: { activeArtifact: true, inputManifest: true },
    });
    if (!head || head.inputManifest.projectId !== projectId) {
      throw new NotFoundException({ code: 'AUDIO_UNDERSTANDING_NOT_FOUND', message: 'Audio understanding not found' });
    }
    return head;
  }

  findHead(inputId: string) {
    return this.prisma.audioUnderstandingHead.findUnique({
      where: { inputManifestId: inputId },
      include: { activeArtifact: true },
    });
  }

  createInitial(input: {
    inputManifestId: string;
    activeArtifactId: string;
    interpretationArtifactId: string;
    interpretationVersion: number;
  }) {
    return this.prisma.audioUnderstandingHead.create({
      data: {
        inputManifestId: input.inputManifestId,
        activeArtifactId: input.activeArtifactId,
        interpretationArtifactId: input.interpretationArtifactId,
        interpretationVersion: input.interpretationVersion,
        version: 1,
      },
    });
  }

  advance(input: {
    inputManifestId: string;
    activeArtifactId: string;
    interpretationArtifactId: string;
    interpretationVersion: number;
    baseVersion: number;
  }) {
    return this.prisma.audioUnderstandingHead.updateMany({
      where: { inputManifestId: input.inputManifestId, version: input.baseVersion },
      data: {
        activeArtifactId: input.activeArtifactId,
        interpretationArtifactId: input.interpretationArtifactId,
        interpretationVersion: input.interpretationVersion,
        version: input.baseVersion + 1,
      },
    });
  }
}
