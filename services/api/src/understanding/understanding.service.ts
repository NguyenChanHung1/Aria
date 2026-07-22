import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ArtifactNamespace,
  ArtifactStatus,
  ArtifactType,
  DependencyKind,
  Prisma,
  RetentionClass,
  WorkflowRunStatus,
} from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { AnalysisService } from '../analysis/analysis.service';
import { InputInterpretation } from '../analysis/analysis.contracts';
import { InterpretationRepository } from '../analysis/interpretation.repository';
import { ArtifactRepository } from '../artifacts/artifact.repository';
import { ObjectStorage } from '../artifacts/object-storage';
import { config } from '../config';
import { WorkflowRunService } from '../workflows/workflow-run.service';
import {
  APPROVED_INTERPRETATION_STATUSES,
  AudioUnderstanding,
  UNDERSTANDING_MODULE_NAMES,
  UNDERSTANDING_SCHEMA_VERSION,
  WorkerUnderstandResult,
  UnderstandingSummary,
} from './understanding.contracts';
import { UnderstandingRepository } from './understanding.repository';
import { serializeUnderstandingSummary } from './serialize-understanding';

@Injectable()
export class UnderstandingService {
  private readonly activeRuns = new Set<string>();

  constructor(
    private readonly artifacts: ArtifactRepository,
    private readonly objects: ObjectStorage,
    private readonly interpretations: InterpretationRepository,
    private readonly understanding: UnderstandingRepository,
    private readonly workflowRuns: WorkflowRunService,
    private readonly analysis: AnalysisService,
  ) {}

  async startGeneration(projectId: string, body: { inputId?: string; force?: boolean }, correlationId?: string) {
    if (!config.understanding.enabled) throw new ServiceUnavailableException('Musical understanding is disabled');
    const inputId = body.inputId ?? await this.resolvePrimaryInputId(projectId);
    const interpretationHead = await this.interpretations.get(projectId, inputId);
    const interpretation = interpretationHead.activeArtifact.payload as unknown as InputInterpretation;
    if (!APPROVED_INTERPRETATION_STATUSES.includes(interpretation.reviewStatus as typeof APPROVED_INTERPRETATION_STATUSES[number])) {
      throw new ConflictException({ code: 'INTERPRETATION_NOT_APPROVED', message: 'Interpretation must be approved before musical understanding can run' });
    }

    const existing = await this.understanding.findHead(inputId);
    if (
      existing
      && !body.force
      && existing.interpretationArtifactId === interpretationHead.activeArtifactId
      && existing.interpretationVersion === interpretation.version
      && existing.activeArtifact.status === ArtifactStatus.AVAILABLE
    ) {
      const summary = await this.buildSummary(projectId, inputId, existing.activeArtifactId, existing.activeArtifact.payload as unknown as AudioUnderstanding, existing.activeArtifact.status);
      return { reused: true, understanding: summary, workflowRun: null };
    }

    const run = await this.workflowRuns.createAudioUnderstandingRun(projectId, inputId, correlationId ?? randomUUID());
    void this.executeGeneration(projectId, inputId, interpretation, interpretationHead.activeArtifactId, run.id).catch(() => undefined);
    return { reused: false, workflowRun: this.workflowRuns.serialize(run) };
  }

  async getLatest(projectId: string, inputId?: string) {
    const resolvedInputId = inputId ?? await this.resolvePrimaryInputId(projectId);
    const head = await this.understanding.getHead(projectId, resolvedInputId);
    const payload = head.activeArtifact.payload as unknown as AudioUnderstanding;
    return this.buildSummary(projectId, resolvedInputId, head.activeArtifactId, payload, head.activeArtifact.status, head);
  }

  async getByArtifactId(projectId: string, artifactId: string) {
    const artifact = await this.artifacts.getArtifact(artifactId);
    if (!artifact || artifact.projectId !== projectId || artifact.type !== ArtifactType.AUDIO_UNDERSTANDING) {
      throw new NotFoundException({ code: 'AUDIO_UNDERSTANDING_NOT_FOUND', message: 'Audio understanding not found' });
    }
    const payload = artifact.payload as unknown as AudioUnderstanding;
    const head = await this.understanding.findHead(payload.inputId);
    return this.buildSummary(projectId, payload.inputId, artifactId, payload, artifact.status, head ?? undefined);
  }

  getWorkflowRun(projectId: string, runId: string) {
    return this.workflowRuns.get(projectId, runId).then((run) => this.workflowRuns.serialize(run));
  }

  private async buildSummary(
    projectId: string,
    inputId: string,
    artifactId: string,
    payload: AudioUnderstanding,
    artifactStatus: ArtifactStatus,
    head?: { interpretationVersion: number; activeArtifactId: string; activeArtifact: { status: ArtifactStatus } } | null,
  ): Promise<UnderstandingSummary> {
    let stale = artifactStatus === ArtifactStatus.SUPERSEDED;
    if (!stale && head) {
      try {
        const interpretationHead = await this.interpretations.get(projectId, inputId);
        const interpretation = interpretationHead.activeArtifact.payload as unknown as InputInterpretation;
        stale = interpretation.version > payload.lineage.interpretationVersion
          || interpretationHead.activeArtifactId !== payload.lineage.interpretationArtifactId;
      } catch {
        stale = true;
      }
    }
    const artifact = await this.artifacts.getArtifact(artifactId);
    const download = artifact?.checksumSha256
      ? {
          url: (await this.objects.signDownload(artifact.objectKey)).url,
          expiresAt: new Date(Date.now() + config.objectStorage.signedUrlTtlSeconds * 1000).toISOString(),
          checksumSha256: artifact.checksumSha256,
        }
      : undefined;
    return serializeUnderstandingSummary({ artifactId, payload, stale, download });
  }

  private async executeGeneration(
    projectId: string,
    inputId: string,
    interpretation: InputInterpretation,
    interpretationArtifactId: string,
    runId: string,
  ) {
    if (this.activeRuns.has(runId)) return;
    this.activeRuns.add(runId);
    try {
      await this.workflowRuns.updateStage(runId, 'preparing', 10);
      const manifest = await this.artifacts.getArtifact(inputId);
      if (!manifest || manifest.projectId !== projectId || manifest.type !== ArtifactType.INPUT_MANIFEST) {
        throw new Error('Input manifest not found');
      }
      const manifestPayload = manifest.payload as { workingArtifactId?: string };
      const workingArtifactId = manifestPayload.workingArtifactId;
      if (!workingArtifactId) throw new Error('Working audio is not linked to input');

      let working = await this.artifacts.getArtifact(workingArtifactId);
      if (!working || working.status !== ArtifactStatus.AVAILABLE || !working.checksumSha256) {
        throw new Error('Working audio is not available');
      }

      await this.ensurePhaseTwoArtifacts(projectId, inputId, workingArtifactId);
      const acoustic = await this.requireLatestArtifact(projectId, `acoustic-analysis-${inputId}`);
      const classification = await this.requireLatestArtifact(projectId, `input-classification-${inputId}`);
      const embeddings = await this.requireLatestArtifact(projectId, `audio-embeddings-${inputId}`);

      const moduleRecords: Record<string, Awaited<ReturnType<ArtifactRepository['createArtifactVersion']>>> = {};
      const common = {
        projectId,
        type: ArtifactType.ANALYSIS,
        namespace: ArtifactNamespace.ANALYSIS,
        retentionClass: RetentionClass.INTERMEDIATE,
        parentArtifactId: working.id,
        pipelinePhase: 'understanding',
      };
      const provenance = {
        producer: 'aria-analysis-worker',
        producerVersion: '3.0.0',
        sourceArtifactIds: [working.id, interpretationArtifactId, acoustic.id, classification.id, embeddings.id],
        parameters: { profile: 'understanding-v1' },
        generatedAt: new Date().toISOString(),
      };

      for (const moduleName of UNDERSTANDING_MODULE_NAMES) {
        moduleRecords[moduleName] = await this.artifacts.createArtifactVersion({
          ...common,
          logicalName: `understanding-${moduleName}-${inputId}`,
          fileName: `${moduleName}.json`,
          mimeType: 'application/json',
          dependencies: [
            { artifactId: working.id, kind: DependencyKind.DERIVED_FROM },
            { artifactId: interpretationArtifactId, kind: DependencyKind.REQUIRES },
          ],
          provenance,
        });
      }

      const understandingRecord = await this.artifacts.createArtifactVersion({
        projectId,
        type: ArtifactType.AUDIO_UNDERSTANDING,
        namespace: ArtifactNamespace.ANALYSIS,
        logicalName: `audio-understanding-${inputId}`,
        fileName: 'understanding.json',
        mimeType: 'application/json',
        retentionClass: RetentionClass.INTERMEDIATE,
        parentArtifactId: working.id,
        pipelinePhase: 'understanding',
        modelVersion: 'understanding-v1',
        dependencies: [
          { artifactId: working.id, kind: DependencyKind.DERIVED_FROM },
          { artifactId: interpretationArtifactId, kind: DependencyKind.DERIVED_FROM },
          { artifactId: acoustic.id, kind: DependencyKind.REQUIRES },
          { artifactId: classification.id, kind: DependencyKind.REQUIRES },
          { artifactId: embeddings.id, kind: DependencyKind.REQUIRES },
          ...Object.values(moduleRecords).map((record) => ({ artifactId: record.id, kind: DependencyKind.COMPOSES })),
        ],
        provenance,
      });

      const [sourceUrl, acousticUrl, classificationUrl, embeddingsUrl] = await Promise.all([
        this.objects.signInternalDownload(working.objectKey),
        this.objects.signInternalDownload(acoustic.objectKey),
        this.objects.signInternalDownload(classification.objectKey),
        this.objects.signInternalDownload(embeddings.objectKey),
      ]);
      const moduleUrls = Object.fromEntries(await Promise.all(
        Object.entries(moduleRecords).map(async ([name, record]) => [
          name,
          await this.objects.signInternalUpload(record.objectKey, record.mimeType),
        ]),
      ));
      const understandingUrl = await this.objects.signInternalUpload(understandingRecord.objectKey, understandingRecord.mimeType);

      await this.workflowRuns.updateStage(runId, 'worker', 35);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.understanding.timeoutMs);
      let result: WorkerUnderstandResult;
      try {
        const response = await fetch(`${config.analysis.url}/understand`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            schemaVersion: UNDERSTANDING_SCHEMA_VERSION,
            projectId,
            inputId,
            interpretation: {
              sourceType: interpretation.sourceType,
              musicScope: interpretation.musicScope,
              intendedUses: interpretation.intendedUses,
            },
            source: sourceUrl,
            sourceChecksumSha256: working.checksumSha256,
            inputs: {
              acoustic: { url: acousticUrl.url, headers: acousticUrl.headers, checksumSha256: acoustic.checksumSha256 },
              classification: { url: classificationUrl.url, headers: classificationUrl.headers, checksumSha256: classification.checksumSha256 },
              embeddings: { url: embeddingsUrl.url, headers: embeddingsUrl.headers, checksumSha256: embeddings.checksumSha256 },
            },
            outputs: {
              modules: moduleUrls,
              understanding: understandingUrl,
            },
            policy: {
              optionalModules: config.understanding.optionalModules,
              maxDurationSeconds: config.maxMediaDurationSeconds,
            },
            lineage: {
              workingArtifactId: working.id,
              interpretationArtifactId,
              interpretationVersion: interpretation.version,
            },
          }),
        });
        if (!response.ok) throw new Error(`worker returned ${response.status}`);
        result = await response.json() as WorkerUnderstandResult;
      } catch (error) {
        await Promise.all([
          ...Object.values(moduleRecords).map((record) => this.artifacts.markFailed(record.id, { reason: error instanceof Error ? error.message : 'understanding failed' })),
          this.artifacts.markFailed(understandingRecord.id, { reason: error instanceof Error ? error.message : 'understanding failed' }),
        ]);
        await this.workflowRuns.fail(runId, { message: error instanceof Error ? error.message : 'understanding failed' });
        return;
      } finally {
        clearTimeout(timer);
      }

      await this.workflowRuns.updateStage(runId, 'persisting', 80);
      const moduleEntries = Object.entries(result.modules ?? {});
      for (const [name, moduleResult] of moduleEntries) {
        const record = moduleRecords[name];
        if (!record) continue;
        const verified = await this.objects.checksumAndSize(record.objectKey);
        if (verified.checksumSha256 !== moduleResult.checksumSha256 || verified.fileSize !== Number(moduleResult.fileSize)) {
          await this.artifacts.markFailed(record.id, { reason: 'worker module checksum mismatch' });
          continue;
        }
        await this.artifacts.markAvailable(record.id, {
          checksumSha256: moduleResult.checksumSha256,
          fileSize: BigInt(moduleResult.fileSize),
          payload: moduleResult.payload as Prisma.InputJsonObject,
        });
      }

      const understandingVerified = await this.objects.checksumAndSize(understandingRecord.objectKey);
      if (
        understandingVerified.checksumSha256 !== result.understanding.checksumSha256
        || understandingVerified.fileSize !== Number(result.understanding.fileSize)
      ) {
        await this.artifacts.markFailed(understandingRecord.id, { reason: 'understanding checksum mismatch' });
        await this.workflowRuns.fail(runId, { message: 'understanding output verification failed' });
        return;
      }

      const payload = {
        ...result.understanding.payload,
        lineage: {
          ...result.understanding.payload.lineage,
          inputId,
          workingArtifactId: working.id,
          interpretationArtifactId,
          interpretationVersion: interpretation.version,
          sourceArtifactIds: [working.id, interpretationArtifactId, acoustic.id, classification.id, embeddings.id],
        },
      } as AudioUnderstanding;

      for (const [name, moduleResult] of Object.entries(payload.modules)) {
        const record = moduleRecords[name];
        if (record && moduleResult) moduleResult.artifactId = record.id;
      }

      await this.artifacts.markAvailable(understandingRecord.id, {
        checksumSha256: result.understanding.checksumSha256,
        fileSize: BigInt(result.understanding.fileSize),
        payload: payload as unknown as Prisma.InputJsonObject,
      });

      const existingHead = await this.understanding.findHead(inputId);
      if (existingHead) {
        await this.understanding.advance({
          inputManifestId: inputId,
          activeArtifactId: understandingRecord.id,
          interpretationArtifactId,
          interpretationVersion: interpretation.version,
          baseVersion: existingHead.version,
        });
        if (existingHead.activeArtifactId !== understandingRecord.id) {
          await this.artifacts.markSuperseded(existingHead.activeArtifactId);
        }
      } else {
        await this.understanding.createInitial({
          inputManifestId: inputId,
          activeArtifactId: understandingRecord.id,
          interpretationArtifactId,
          interpretationVersion: interpretation.version,
        });
      }

      const partial = result.workflowStatus === 'partial';
      await this.workflowRuns.succeed(runId, understandingRecord.id, partial);
    } finally {
      this.activeRuns.delete(runId);
    }
  }

  private async ensurePhaseTwoArtifacts(projectId: string, inputId: string, workingArtifactId: string) {
    const acoustic = await this.artifacts.findLatestAvailable(projectId, `acoustic-analysis-${inputId}`);
    if (!acoustic) await this.analysis.analyze(projectId, inputId, workingArtifactId);
  }

  private async requireLatestArtifact(projectId: string, logicalName: string) {
    const artifact = await this.artifacts.findLatestAvailable(projectId, logicalName);
    if (!artifact || !artifact.checksumSha256) throw new Error(`${logicalName} is not available`);
    return artifact;
  }

  private async resolvePrimaryInputId(projectId: string) {
    const project = await this.artifacts.getProject(projectId);
    if (!project) throw new NotFoundException({ code: 'PROJECT_NOT_FOUND', message: 'Project not found' });
    const metadata = project.metadata as { inputId?: string };
    if (metadata.inputId) return metadata.inputId;
    const manifest = project.artifacts.find((artifact) => artifact.type === ArtifactType.INPUT_MANIFEST && artifact.status === ArtifactStatus.AVAILABLE);
    if (!manifest) throw new NotFoundException({ code: 'INPUT_NOT_FOUND', message: 'Project has no input manifest' });
    return manifest.id;
  }
}
