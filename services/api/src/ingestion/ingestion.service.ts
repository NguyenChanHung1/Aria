import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { INGESTION_SCHEMA_VERSION, type AgentCompatibilityAsset, type ArtifactReference, type IngestionResult, type InputManifest, type MediaPurpose, type NormalizationProfile } from './ingestion.contracts';
import { MediaPolicyService } from './media-policy.service';
import { UploadScanner } from './upload-scanner.service';
import { ProbeService } from './probe.service';
import { IngestionStorageService } from './storage.service';
import { COMPATIBILITY_PROFILE, NormalizerService, workingProfile } from './normalizer.service';
import { QualityService } from './quality.service';
import { ManifestService } from './manifest.service';

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
  ) {}

  async ingest(projectId: string, file: Express.Multer.File, purposeValue: unknown, signal?: AbortSignal): Promise<IngestionResult> {
    const startedAt = Date.now();
    const manifestId = randomUUID();
    const sourceId = randomUUID();
    const workingId = randomUUID();
    const compatibilityId = randomUUID();
    let sourcePath: string | undefined;
    let workingTemporaryPath: string | undefined;
    let compatibilityTemporaryPath: string | undefined;
    let workingPath: string | undefined;
    let compatibilityPath: string | undefined;
    let rawProbePath: string | undefined;

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
      compatibilityPath = path.join(this.storage.projectDirectory(projectId), 'normalized-audio', `${compatibilityId}.compatibility.wav`);
      workingTemporaryPath = this.storage.temporaryArtifact(workingPath);
      compatibilityTemporaryPath = this.storage.temporaryArtifact(compatibilityPath);

      const qualityResult = await this.quality.analyze(sourcePath, accepted.selectedAudioStreamIndex, sourceInspection.metadata, signal);
      const workingArgs = await this.normalizer.normalize(sourcePath, accepted.selectedAudioStreamIndex, workingTemporaryPath, selectedWorkingProfile, signal);
      const compatibilityArgs = await this.normalizer.normalize(sourcePath, accepted.selectedAudioStreamIndex, compatibilityTemporaryPath, COMPATIBILITY_PROFILE, signal);
      const [ffmpegVersion, ffprobeVersion] = await Promise.all([
        this.normalizer.version(signal),
        this.probe.version(signal),
      ]);
      await Promise.all([
        this.storage.publish(workingTemporaryPath, workingPath),
        this.storage.publish(compatibilityTemporaryPath, compatibilityPath),
      ]);
      workingTemporaryPath = undefined;
      compatibilityTemporaryPath = undefined;

      const source = await this.artifact(projectId, sourceId, 'source-media', sourcePath, 'source', this.policy.detectedMediaType(sourceInspection.metadata, accepted.kind));
      const working = await this.artifact(projectId, workingId, 'normalized-audio', workingPath, 'working', 'audio/wav', selectedWorkingProfile, sourceId);
      const compatibility = await this.artifact(projectId, compatibilityId, 'normalized-audio', compatibilityPath, 'compatibility', 'audio/wav', COMPATIBILITY_PROFILE, sourceId);
      const rawProbeArtifact = await this.manifests.persistRawProbe(projectId, manifestId, sourceInspection.raw);
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
        derived: [working, compatibility],
        probe: sourceInspection.metadata,
        quality: qualityResult.quality,
        findings: [...accepted.findings, ...qualityResult.findings],
        tools: { ffmpegVersion, ffprobeVersion, ffmpegArguments: [workingArgs, compatibilityArgs] },
      };
      const manifestRef = await this.manifests.persist(manifest);
      this.logger.log(JSON.stringify({ event: 'media_ingested', projectId, manifestId, kind: accepted.kind, bytes: source.bytes, durationMs: Date.now() - startedAt, warnings: manifest.findings.length }));
      return { manifest, manifestRef, internal: { sourcePath, compatibilityPath } };
    } catch (error) {
      await this.storage.cleanup(file?.path, sourcePath, workingTemporaryPath, compatibilityTemporaryPath, workingPath, compatibilityPath, rawProbePath);
      const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : error instanceof Error ? error.name : 'unknown';
      this.logger.warn(JSON.stringify({ event: 'media_ingestion_failed', projectId, durationMs: Date.now() - startedAt, code }));
      throw error;
    }
  }

  toAgentAsset(result: IngestionResult): AgentCompatibilityAsset {
    const compatibility = result.manifest.derived.find((artifact) => artifact.role === 'compatibility');
    if (!compatibility) throw new Error('Compatibility artifact is missing');
    return {
      kind: result.manifest.kind,
      originalPath: result.internal.sourcePath,
      normalizedWavPath: result.internal.compatibilityPath,
      format: 'wav-pcm-s16le-44100-mono',
      artifactRef: compatibility.ref,
      manifestRef: result.manifestRef,
      sha256: compatibility.sha256,
    };
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
      ref: this.storage.artifactRef(projectId, path.join(directory, path.basename(filePath))),
      mediaType,
      bytes: await this.storage.bytes(filePath),
      sha256: await this.storage.sha256(filePath),
      ...(profile ? { profile } : {}),
      ...(parentArtifactId ? { parentArtifactId } : {}),
    };
  }
}
