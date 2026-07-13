import { Module } from '@nestjs/common';
import { IngestionService } from './ingestion.service';
import { MediaPolicyService } from './media-policy.service';
import { ProcessRunnerService } from './process-runner.service';
import { ProbeService } from './probe.service';
import { IngestionStorageService } from './storage.service';
import { NormalizerService } from './normalizer.service';
import { QualityService } from './quality.service';
import { ManifestService } from './manifest.service';
import { NoopUploadScanner, UploadScanner } from './upload-scanner.service';

@Module({
  providers: [
    IngestionService,
    MediaPolicyService,
    ProcessRunnerService,
    ProbeService,
    IngestionStorageService,
    NormalizerService,
    QualityService,
    ManifestService,
    { provide: UploadScanner, useClass: NoopUploadScanner },
  ],
  exports: [IngestionService],
})
export class IngestionModule {}
