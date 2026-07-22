import { Module } from '@nestjs/common';
import { ArtifactRepository } from './artifact.repository';
import { ArtifactsController } from './artifacts.controller';
import { LineageService } from './lineage.service';
import { InvalidationService } from './invalidation.service';
import { ObjectStorage, S3ObjectStorage } from './object-storage';

@Module({
  controllers: [ArtifactsController],
  providers: [ArtifactRepository, LineageService, InvalidationService, { provide: ObjectStorage, useClass: S3ObjectStorage }],
  exports: [ArtifactRepository, LineageService, InvalidationService, ObjectStorage],
})
export class ArtifactsModule {}
