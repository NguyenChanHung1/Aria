import { Module } from '@nestjs/common';
import { AnalysisModule } from '../analysis/analysis.module';
import { ArtifactsModule } from '../artifacts/artifacts.module';
import { WorkflowRunRepository } from '../workflows/workflow-run.repository';
import { WorkflowRunService } from '../workflows/workflow-run.service';
import { UnderstandingController } from './understanding.controller';
import { UnderstandingRepository } from './understanding.repository';
import { UnderstandingService } from './understanding.service';

@Module({
  imports: [ArtifactsModule, AnalysisModule],
  controllers: [UnderstandingController],
  providers: [UnderstandingRepository, UnderstandingService, WorkflowRunRepository, WorkflowRunService],
  exports: [UnderstandingService, WorkflowRunService],
})
export class UnderstandingModule {}
