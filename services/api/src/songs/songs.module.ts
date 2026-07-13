import { Module } from '@nestjs/common';
import { IngestionModule } from '../ingestion/ingestion.module';
import { SongBriefService } from './song-brief.service';
import { SongsController } from './songs.controller';
import { ArtifactsModule } from '../artifacts/artifacts.module';

@Module({ imports: [IngestionModule, ArtifactsModule], controllers: [SongsController], providers: [SongBriefService] })
export class SongsModule {}
