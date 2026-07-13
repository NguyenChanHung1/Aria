import { Module } from '@nestjs/common';
import { ArtifactRepository } from './artifact.repository';
import { ArtifactsController } from './artifacts.controller';
import { ObjectStorage, S3ObjectStorage } from './object-storage';
import { ProjectsController } from './projects.controller';

@Module({
  controllers: [ArtifactsController, ProjectsController],
  providers: [ArtifactRepository, { provide: ObjectStorage, useClass: S3ObjectStorage }],
  exports: [ArtifactRepository, ObjectStorage],
})
export class ArtifactsModule {}
