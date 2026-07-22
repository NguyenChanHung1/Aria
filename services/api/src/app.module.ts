import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { SongsModule } from './songs/songs.module';
import { ArtifactsModule } from './artifacts/artifacts.module';
import { DatabaseModule } from './database/database.module';
import { AnalysisModule } from './analysis/analysis.module';
import { ProjectsModule } from './projects/projects.module';
import { InputsModule } from './inputs/inputs.module';

import { UnderstandingModule } from './understanding/understanding.module';

@Module({ imports: [DatabaseModule, ArtifactsModule, ProjectsModule, InputsModule, AnalysisModule, UnderstandingModule, HealthModule, SongsModule] })
export class AppModule {}
