import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { SettingsModule } from './settings/settings.module';
import { SongsModule } from './songs/songs.module';
import { ArtifactsModule } from './artifacts/artifacts.module';
import { DatabaseModule } from './database/database.module';

@Module({ imports: [DatabaseModule, ArtifactsModule, HealthModule, SettingsModule, SongsModule] })
export class AppModule {}
