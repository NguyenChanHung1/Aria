import { Injectable } from '@nestjs/common';
import { WorkflowRunKind, WorkflowRunStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { WorkflowRunRepository } from './workflow-run.repository';

@Injectable()
export class WorkflowRunService {
  constructor(private readonly runs: WorkflowRunRepository) {}

  createAudioUnderstandingRun(projectId: string, inputManifestId: string, correlationId?: string) {
    return this.runs.create({
      projectId,
      kind: WorkflowRunKind.AUDIO_UNDERSTANDING,
      inputManifestId,
      correlationId,
      metadata: { kind: 'audio_understanding' },
    });
  }

  get(projectId: string, runId: string) {
    return this.runs.get(projectId, runId);
  }

  updateStage(runId: string, stage: string, progress: number) {
    return this.runs.update(runId, { stage, progress });
  }

  succeed(runId: string, resultArtifactId: string, partial = false) {
    return this.runs.update(runId, {
      status: partial ? WorkflowRunStatus.PARTIAL : WorkflowRunStatus.SUCCEEDED,
      stage: 'complete',
      progress: 100,
      resultArtifactId,
      finishedAt: new Date(),
    });
  }

  fail(runId: string, error: Prisma.InputJsonObject, resultArtifactId?: string) {
    return this.runs.update(runId, {
      status: WorkflowRunStatus.FAILED,
      stage: 'failed',
      progress: 100,
      error,
      ...(resultArtifactId ? { resultArtifactId } : {}),
      finishedAt: new Date(),
    });
  }

  serialize(run: Awaited<ReturnType<WorkflowRunRepository['get']>>) {
    return {
      id: run.id,
      projectId: run.projectId,
      kind: run.kind.toLowerCase(),
      status: run.status.toLowerCase(),
      stage: run.stage,
      progress: run.progress,
      correlationId: run.correlationId,
      inputManifestId: run.inputManifestId,
      resultArtifactId: run.resultArtifactId,
      error: run.error,
      metadata: run.metadata,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
    };
  }
}
