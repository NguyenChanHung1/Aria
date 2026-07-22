import { Body, Controller, Get, Headers, HttpCode, Param, Post } from '@nestjs/common';
import { UnderstandingService } from './understanding.service';
import { WorkflowRunService } from '../workflows/workflow-run.service';

@Controller('projects/:projectId')
export class UnderstandingController {
  constructor(
    private readonly understanding: UnderstandingService,
    private readonly workflowRuns: WorkflowRunService,
  ) {}

  @Post('audio-understanding')
  @HttpCode(202)
  async generate(
    @Param('projectId') projectId: string,
    @Body() body: { inputId?: string; force?: boolean },
    @Headers('x-correlation-id') correlationId?: string,
  ) {
    const result = await this.understanding.startGeneration(projectId, body, correlationId?.trim());
    if (result.reused) return { reused: true, understanding: result.understanding, workflowRun: null };
    return { reused: false, workflowRun: result.workflowRun };
  }

  @Get('audio-understanding')
  getLatest(@Param('projectId') projectId: string) {
    return this.understanding.getLatest(projectId);
  }

  @Get('audio-understanding/:artifactId')
  getByArtifact(@Param('projectId') projectId: string, @Param('artifactId') artifactId: string) {
    return this.understanding.getByArtifactId(projectId, artifactId);
  }

  @Get('workflow-runs/:runId')
  getWorkflowRun(@Param('projectId') projectId: string, @Param('runId') runId: string) {
    return this.workflowRuns.get(projectId, runId).then((run) => this.workflowRuns.serialize(run));
  }
}
