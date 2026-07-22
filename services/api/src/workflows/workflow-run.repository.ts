import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, WorkflowRunKind, WorkflowRunStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class WorkflowRunRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: {
    projectId: string;
    kind: WorkflowRunKind;
    correlationId?: string;
    inputManifestId?: string;
    metadata?: Prisma.InputJsonObject;
  }) {
    return this.prisma.workflowRun.create({
      data: {
        projectId: input.projectId,
        kind: input.kind,
        status: WorkflowRunStatus.RUNNING,
        stage: 'preparing',
        progress: 0,
        ...(input.correlationId ? { correlationId: input.correlationId } : {}),
        ...(input.inputManifestId ? { inputManifestId: input.inputManifestId } : {}),
        metadata: input.metadata ?? {},
      },
    });
  }

  async get(projectId: string, runId: string) {
    const run = await this.prisma.workflowRun.findUnique({ where: { id: runId } });
    if (!run || run.projectId !== projectId) throw new NotFoundException({ code: 'WORKFLOW_RUN_NOT_FOUND', message: 'Workflow run not found' });
    return run;
  }

  update(runId: string, data: {
    status?: WorkflowRunStatus;
    stage?: string;
    progress?: number;
    resultArtifactId?: string;
    error?: Prisma.InputJsonObject;
    metadata?: Prisma.InputJsonObject;
    finishedAt?: Date;
  }) {
    return this.prisma.workflowRun.update({
      where: { id: runId },
      data: {
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.stage !== undefined ? { stage: data.stage } : {}),
        ...(data.progress !== undefined ? { progress: data.progress } : {}),
        ...(data.resultArtifactId !== undefined ? { resultArtifactId: data.resultArtifactId } : {}),
        ...(data.error !== undefined ? { error: data.error } : {}),
        ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
        ...(data.finishedAt !== undefined ? { finishedAt: data.finishedAt } : {}),
      },
    });
  }
}
