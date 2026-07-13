import { Module } from '@nestjs/common';
import { IngestionModule } from '../ingestion/ingestion.module';
import { SongBriefService } from './song-brief.service';
import { SongsController } from './songs.controller';
import { ArtifactsModule } from '../artifacts/artifacts.module';
import { AnalysisModule } from '../analysis/analysis.module';

@Module({ imports: [IngestionModule, ArtifactsModule, AnalysisModule], controllers: [SongsController], providers: [SongBriefService] })
export class SongsModule {}
