import { Module } from '@nestjs/common';
import { IngestionModule } from '../ingestion/ingestion.module';
import { SongsController } from './songs.controller';
import { ArtifactsModule } from '../artifacts/artifacts.module';
import { AnalysisModule } from '../analysis/analysis.module';
import { ProjectsModule } from '../projects/projects.module';

@Module({ imports: [IngestionModule, ArtifactsModule, AnalysisModule, ProjectsModule], controllers: [SongsController], providers: [] })
export class SongsModule {}
