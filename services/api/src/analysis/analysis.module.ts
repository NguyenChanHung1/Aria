import { Module } from '@nestjs/common';
import { ArtifactsModule } from '../artifacts/artifacts.module';
import { InterpretationRepository } from './interpretation.repository';
import { InterpretationsController } from './interpretations.controller';
import { AnalysisService } from './analysis.service';

@Module({ imports: [ArtifactsModule], controllers: [InterpretationsController], providers: [InterpretationRepository, AnalysisService], exports: [AnalysisService] })
export class AnalysisModule {}
