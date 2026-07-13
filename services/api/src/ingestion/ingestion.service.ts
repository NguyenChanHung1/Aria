import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { INGESTION_SCHEMA_VERSION, type ArtifactReference, type IngestionResult, type InputManifest, type NormalizationProfile } from './ingestion.contracts';
import { MediaPolicyService } from './media-policy.service';
import { UploadScanner } from './upload-scanner.service';
import { ProbeService } from './probe.service';
import { IngestionStorageService } from './storage.service';
import { NormalizerService, workingProfile } from './normalizer.service';
import { QualityService } from './quality.service';
import { ManifestService } from './manifest.service';
import { ArtifactNamespace, ArtifactType, DependencyKind, RetentionClass } from '@prisma/client';
import { ArtifactRepository } from '../artifacts/artifact.repository';
import { ObjectStorage } from '../artifacts/object-storage';

function displayName(originalName: string): string {
  return path.basename(originalName).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 255);
}

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly policy: MediaPolicyService,
    private readonly scanner: UploadScanner,
    private readonly probe: ProbeService,
    private readonly storage: IngestionStorageService,
    private readonly normalizer: NormalizerService,
    private readonly quality: QualityService,
    private readonly manifests: ManifestService,
    private readonly artifacts: ArtifactRepository,
    private readonly objects: ObjectStorage,
  ) {}

  async ingest(projectId: string, file: Express.Multer.File, purposeValue: unknown, signal?: AbortSignal): Promise<IngestionResult> {
    const startedAt = Date.now();
    const manifestId = randomUUID();
    const sourceId = randomUUID();
    const workingId = randomUUID();
    const rawProbeId = randomUUID();
    let sourcePath: string | undefined;
    let workingTemporaryPath: string | undefined;
    let workingPath: string | undefined;
    let rawProbePath: string | undefined;
    let artifactPersistenceStarted = false;

    try {
      this.policy.validateUpload(file);
      const purpose = this.policy.purpose(purposeValue);
      await this.scanner.scan(file.path, signal);
      const sourceInspection = await this.probe.inspectDetailed(file.path, signal);
      const accepted = this.policy.validateProbe(file, sourceInspection.metadata);
      await this.storage.prepare(projectId);
      sourcePath = await this.storage.preserveSource(
        projectId,
        file.path,
        sourceId,
        this.policy.extensionFor(sourceInspection.metadata, accepted.kind),
      );
      const selectedWorkingProfile = workingProfile(purpose);
      workingPath = path.join(this.storage.projectDirectory(projectId), 'normalized-audio', `${workingId}.working.wav`);
      workingTemporaryPath = this.storage.temporaryArtifact(workingPath);

      const qualityResult = await this.quality.analyze(sourcePath, accepted.selectedAudioStreamIndex, sourceInspection.metadata, signal);
      const workingArgs = await this.normalizer.normalize(sourcePath, accepted.selectedAudioStreamIndex, workingTemporaryPath, selectedWorkingProfile, signal);
      const [ffmpegVersion, ffprobeVersion] = await Promise.all([
        this.normalizer.version(signal),
        this.probe.version(signal),
      ]);
      await this.storage.publish(workingTemporaryPath, workingPath);
      workingTemporaryPath = undefined;

      const source = await this.artifact(projectId, sourceId, 'source-media', sourcePath, 'source', this.policy.detectedMediaType(sourceInspection.metadata, accepted.kind));
      const working = await this.artifact(projectId, workingId, 'normalized-audio', workingPath, 'working', 'audio/wav', selectedWorkingProfile, sourceId);
      const rawProbeArtifact = await this.manifests.persistRawProbe(projectId, rawProbeId, sourceInspection.raw);
      rawProbePath = rawProbeArtifact.filePath;
      const manifest: InputManifest = {
        schemaVersion: INGESTION_SCHEMA_VERSION,
        id: manifestId,
        projectId,
        kind: accepted.kind,
        purpose,
        createdAt: new Date().toISOString(),
        originalDisplayName: displayName(file.originalname),
        clientMediaType: file.mimetype || 'application/octet-stream',
        detectedMediaType: this.policy.detectedMediaType(sourceInspection.metadata, accepted.kind),
        selectedAudioStreamIndex: accepted.selectedAudioStreamIndex,
        rawProbeRef: rawProbeArtifact.ref,
        source,
        derived: [working],
        probe: sourceInspection.metadata,
        quality: qualityResult.quality,
        findings: [...accepted.findings, ...qualityResult.findings],
        tools: { ffmpegVersion, ffprobeVersion, ffmpegArguments: [workingArgs] },
      };
      const persistedManifest = await this.manifests.persist(manifest);
      artifactPersistenceStarted = true;
      await this.persistCanonicalArtifacts({
        projectId,
        sourceId,
        sourcePath,
        source,
        workingId,
        workingPath,
        working,
        rawProbeId,
        rawProbePath: rawProbeArtifact.filePath,
        manifestId,
        manifestPath: persistedManifest.filePath,
        manifest,
      });
      const manifestRef = persistedManifest.ref;
      this.logger.log(JSON.stringify({ event: 'media_ingested', projectId, manifestId, kind: accepted.kind, bytes: source.bytes, durationMs: Date.now() - startedAt, warnings: manifest.findings.length }));
      return { manifest, manifestRef, inputId: manifestId, workingArtifactId: workingId };
    } catch (error) {
      await this.storage.cleanup(file?.path, sourcePath, workingTemporaryPath, workingPath, rawProbePath);
      if (artifactPersistenceStarted) await Promise.all([sourceId, workingId, rawProbeId, manifestId].map((id) => this.artifacts.markFailed(id, { reason: 'ingestion persistence failed' }).catch(() => undefined)));
      const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : error instanceof Error ? error.name : 'unknown';
      this.logger.warn(JSON.stringify({ event: 'media_ingestion_failed', projectId, durationMs: Date.now() - startedAt, code }));
      throw error;
    }
  }

  private async persistCanonicalArtifacts(input: {
    projectId: string;
    sourceId: string;
    sourcePath: string;
    source: ArtifactReference;
    workingId: string;
    workingPath: string;
    working: ArtifactReference;
    rawProbeId: string;
    rawProbePath: string;
    manifestId: string;
    manifestPath: string;
    manifest: InputManifest;
  }): Promise<void> {
    const provenance = (sourceArtifactIds: string[]) => ({
      producer: 'aria-api-ingestion', producerVersion: '2.0.0', sourceArtifactIds,
      parameters: {}, generatedAt: new Date().toISOString(),
    });
    const sourceRecord = await this.artifacts.createArtifactVersion({
      id: input.sourceId, projectId: input.projectId, type: ArtifactType.SOURCE_MEDIA,
      namespace: ArtifactNamespace.ORIGINALS, logicalName: 'source-input',
      fileName: path.basename(input.sourcePath), mimeType: input.source.mediaType,
      retentionClass: RetentionClass.ORIGINAL, pipelinePhase: 'ingestion', provenance: provenance([]),
    });
    const workingRecord = await this.artifacts.createArtifactVersion({
      id: input.workingId, projectId: input.projectId, type: ArtifactType.NORMALIZED_AUDIO,
      namespace: ArtifactNamespace.NORMALIZED_AUDIO, logicalName: 'working-audio', fileName: 'working.wav',
      mimeType: 'audio/wav', retentionClass: RetentionClass.INTERMEDIATE,
      parentArtifactId: input.sourceId, dependencies: [{ artifactId: input.sourceId, kind: DependencyKind.DERIVED_FROM }],
      pipelinePhase: 'ingestion', provenance: provenance([input.sourceId]), payload: input.working.profile ?? {},
    });
    const probeRecord = await this.artifacts.createArtifactVersion({
      id: input.rawProbeId, projectId: input.projectId, type: ArtifactType.ANALYSIS,
      namespace: ArtifactNamespace.ANALYSIS, logicalName: 'raw-ffprobe', fileName: 'ffprobe.json',
      mimeType: 'application/json', retentionClass: RetentionClass.INTERMEDIATE,
      parentArtifactId: input.sourceId, dependencies: [{ artifactId: input.sourceId, kind: DependencyKind.DERIVED_FROM }],
      pipelinePhase: 'ingestion', provenance: provenance([input.sourceId]),
    });
    const manifestRecord = await this.artifacts.createArtifactVersion({
      id: input.manifestId, projectId: input.projectId, type: ArtifactType.INPUT_MANIFEST,
      namespace: ArtifactNamespace.ANALYSIS, logicalName: 'input-manifest', fileName: 'input-manifest.json',
      mimeType: 'application/json', retentionClass: RetentionClass.INTERMEDIATE,
      parentArtifactId: input.sourceId,
      dependencies: [input.sourceId, input.workingId, input.rawProbeId].map((artifactId) => ({ artifactId, kind: DependencyKind.REQUIRES })),
      pipelinePhase: 'ingestion', provenance: provenance([input.sourceId, input.workingId, input.rawProbeId]),
      payload: { workingArtifactId: input.workingId, rawProbeArtifactId: input.rawProbeId },
    });
    await Promise.all([
      this.objects.putFile(sourceRecord.objectKey, input.sourcePath, sourceRecord.mimeType),
      this.objects.putFile(workingRecord.objectKey, input.workingPath, workingRecord.mimeType),
      this.objects.putFile(probeRecord.objectKey, input.rawProbePath, probeRecord.mimeType),
      this.objects.putFile(manifestRecord.objectKey, input.manifestPath, manifestRecord.mimeType),
    ]);
    await Promise.all([
      this.artifacts.markAvailable(sourceRecord.id, { checksumSha256: input.source.sha256, fileSize: BigInt(input.source.bytes), durationMs: Math.round(input.manifest.probe.durationSeconds * 1000) }),
      this.artifacts.markAvailable(workingRecord.id, { checksumSha256: input.working.sha256, fileSize: BigInt(input.working.bytes), durationMs: Math.round(input.manifest.probe.durationSeconds * 1000), sampleRate: input.working.profile?.sampleRate, channels: input.working.profile?.channels }),
      this.completeLocalArtifact(probeRecord.id, input.rawProbePath),
      this.completeLocalArtifact(manifestRecord.id, input.manifestPath),
    ]);
  }

  private async completeLocalArtifact(id: string, filePath: string): Promise<void> {
    await this.artifacts.markAvailable(id, { checksumSha256: await this.storage.sha256(filePath), fileSize: BigInt(await this.storage.bytes(filePath)) });
  }

  publicResult(result: IngestionResult): Record<string, unknown> {
    const { tools: _tools, ...manifest } = result.manifest;
    return { manifest, manifestRef: result.manifestRef };
  }

  private async artifact(
    projectId: string,
    id: string,
    directory: 'source-media' | 'normalized-audio',
    filePath: string,
    role: ArtifactReference['role'],
    mediaType: string,
    profile?: NormalizationProfile,
    parentArtifactId?: string,
  ): Promise<ArtifactReference> {
    return {
      id,
      role,
      ref: `artifact:${id}`,
      mediaType,
      bytes: await this.storage.bytes(filePath),
      sha256: await this.storage.sha256(filePath),
      ...(profile ? { profile } : {}),
      ...(parentArtifactId ? { parentArtifactId } : {}),
    };
  }
}
