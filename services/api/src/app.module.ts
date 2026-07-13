import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { SongsModule } from './songs/songs.module';
import { ArtifactsModule } from './artifacts/artifacts.module';
import { DatabaseModule } from './database/database.module';
import { AnalysisModule } from './analysis/analysis.module';

@Module({ imports: [DatabaseModule, ArtifactsModule, AnalysisModule, HealthModule, SongsModule] })
export class AppModule {}
