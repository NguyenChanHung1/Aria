import { Module } from '@nestjs/common';
import { ArtifactsModule } from '../artifacts/artifacts.module';
import { BriefService } from './brief.service';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  imports: [ArtifactsModule],
  controllers: [ProjectsController],
  providers: [BriefService, ProjectsService],
  exports: [BriefService, ProjectsService],
})
export class ProjectsModule {}
