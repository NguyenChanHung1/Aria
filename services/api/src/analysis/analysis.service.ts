import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ArtifactNamespace, ArtifactType, DependencyKind, Prisma, RetentionClass } from '@prisma/client';
import { createHash } from 'node:crypto';
import { ArtifactRepository } from '../artifacts/artifact.repository';
import { ObjectStorage } from '../artifacts/object-storage';
import { config } from '../config';
import { ANALYSIS_SCHEMA_VERSION, INTENDED_USES, InputClassification, InputInterpretation, IntendedUse, MUSIC_SCOPES, SOURCE_TYPES, SourceType, WorkerResult } from './analysis.contracts';
import { InterpretationRepository } from './interpretation.repository';

@Injectable()
export class AnalysisService {
  constructor(private readonly artifacts: ArtifactRepository, private readonly objects: ObjectStorage, private readonly interpretations: InterpretationRepository) {}

  async analyze(projectId: string, inputId: string, workingArtifactId: string): Promise<InputInterpretation | null> {
    if (!config.analysis.enabled) return null;
    try { return (await this.interpretations.get(projectId, inputId)).activeArtifact.payload as unknown as InputInterpretation; } catch (error) { if (!(error instanceof NotFoundException)) throw error; }
    const working = await this.artifacts.getArtifact(workingArtifactId);
    if (!working || working.projectId !== projectId || !working.checksumSha256) throw new BadRequestException('Working audio is not available');
    const common = { projectId, type: ArtifactType.ANALYSIS, namespace: ArtifactNamespace.ANALYSIS, retentionClass: RetentionClass.INTERMEDIATE, parentArtifactId: working.id, pipelinePhase: 'analysis' };
    const provenance = { producer: 'aria-analysis-worker', producerVersion: '2.0.0', sourceArtifactIds: [working.id], parameters: { profile: 'acoustic-v1' }, generatedAt: new Date().toISOString() };
    const acoustic = await this.artifacts.createArtifactVersion({ ...common, logicalName: `acoustic-analysis-${inputId}`, fileName: 'acoustic.json', mimeType: 'application/json', dependencies: [{ artifactId: working.id, kind: DependencyKind.DERIVED_FROM }], provenance });
    const embeddings = await this.artifacts.createArtifactVersion({ ...common, logicalName: `audio-embeddings-${inputId}`, fileName: 'embeddings.npz', mimeType: 'application/octet-stream', dependencies: [{ artifactId: working.id, kind: DependencyKind.DERIVED_FROM }], modelVersion: 'yamnet-1', provenance });
    const classification = await this.artifacts.createArtifactVersion({ ...common, logicalName: `input-classification-${inputId}`, fileName: 'classification.json', mimeType: 'application/json', dependencies: [{ artifactId: acoustic.id }, { artifactId: embeddings.id }], modelVersion: 'yamnet-audioset-baseline-v1', provenance });
    const [sourceUrl, acousticUrl, embeddingUrl, classificationUrl] = await Promise.all([
      this.objects.signInternalDownload(working.objectKey),
      this.objects.signInternalUpload(acoustic.objectKey, acoustic.mimeType),
      this.objects.signInternalUpload(embeddings.objectKey, embeddings.mimeType),
      this.objects.signInternalUpload(classification.objectKey, classification.mimeType),
    ]);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.analysis.timeoutMs);
    let result: WorkerResult;
    try {
      const response = await fetch(`${config.analysis.url}/analyze`, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal, body: JSON.stringify({
        schemaVersion: ANALYSIS_SCHEMA_VERSION, projectId, inputId, workingArtifactId: working.id, sourceChecksumSha256: working.checksumSha256,
        source: sourceUrl, outputs: { acoustic: acousticUrl, embeddings: embeddingUrl, classification: classificationUrl },
      }) });
      if (!response.ok) throw new Error(`worker returned ${response.status}`);
      result = await response.json() as WorkerResult;
    } catch (error) {
      await Promise.all([acoustic.id, embeddings.id, classification.id].map((id) => this.artifacts.markFailed(id, { reason: error instanceof Error ? error.message : 'analysis failed' }).catch(() => undefined)));
      throw new ServiceUnavailableException('Input analysis is temporarily unavailable');
    } finally { clearTimeout(timer); }
    const verified = await Promise.all([acoustic, embeddings, classification].map((item) => this.objects.checksumAndSize(item.objectKey)));
    const claimed = [result.acoustic, result.embeddings, result.classification];
    if (verified.some((value, index) => value.checksumSha256 !== claimed[index].checksumSha256 || value.fileSize !== claimed[index].fileSize)) {
      await Promise.all([acoustic.id, embeddings.id, classification.id].map((id) => this.artifacts.markFailed(id, { reason: 'worker output checksum mismatch' })));
      throw new ServiceUnavailableException('Analysis output verification failed');
    }
    await Promise.all([
      this.artifacts.markAvailable(acoustic.id, { checksumSha256: result.acoustic.checksumSha256, fileSize: BigInt(result.acoustic.fileSize), payload: result.acoustic.payload as Prisma.InputJsonObject }),
      this.artifacts.markAvailable(embeddings.id, { checksumSha256: result.embeddings.checksumSha256, fileSize: BigInt(result.embeddings.fileSize), payload: result.embeddings.manifest as Prisma.InputJsonObject }),
      this.artifacts.markAvailable(classification.id, { checksumSha256: result.classification.checksumSha256, fileSize: BigInt(result.classification.fileSize), payload: result.classification.payload as unknown as Prisma.InputJsonObject }),
    ]);
    return this.createInitial(projectId, inputId, classification.id, result.classification.payload);
  }

  async get(projectId: string, inputId: string) {
    const head = await this.interpretations.get(projectId, inputId);
    const interpretation = head.activeArtifact.payload as unknown as InputInterpretation;
    const classification = await this.artifacts.getArtifact(interpretation.classificationArtifactId);
    return { interpretation, candidates: (classification?.payload as unknown as InputClassification | undefined)?.sourceType ?? [], correctionOptions: { sourceTypes: SOURCE_TYPES, musicScopes: MUSIC_SCOPES, intendedUses: INTENDED_USES } };
  }

  async correct(projectId: string, inputId: string, body: Record<string, unknown>, editorId: string) {
    if (!Number.isInteger(body.baseVersion)) throw new BadRequestException('baseVersion must be an integer');
    const currentHead = await this.interpretations.get(projectId, inputId);
    if (currentHead.version !== body.baseVersion) throw new ConflictException('Interpretation has changed; refresh and retry');
    const current = currentHead.activeArtifact.payload as unknown as InputInterpretation;
    const sourceType = body.sourceType === undefined ? current.sourceType : this.enumValue(body.sourceType, SOURCE_TYPES, 'sourceType');
    const musicScope = body.musicScope === undefined ? current.musicScope : this.enumValue(body.musicScope, MUSIC_SCOPES, 'musicScope');
    const intendedUses = body.intendedUses === undefined ? current.intendedUses : this.useValues(body.intendedUses);
    const changed = sourceType !== current.sourceType || musicScope !== current.musicScope || JSON.stringify(intendedUses) !== JSON.stringify(current.intendedUses);
    const next: InputInterpretation = { ...current, version: current.version + 1, sourceType, musicScope, intendedUses, suggestedUses: this.suggestions(sourceType), origins: { sourceType: body.sourceType === undefined ? current.origins.sourceType : 'user', musicScope: body.musicScope === undefined ? current.origins.musicScope : 'user', intendedUses: body.intendedUses === undefined ? current.origins.intendedUses : 'user' }, reviewStatus: changed ? 'user_corrected' : 'user_confirmed', actor: editorId, createdAt: new Date().toISOString(), warnings: this.compatibilityWarnings(sourceType, intendedUses) };
    const artifact = await this.writeInterpretation(projectId, inputId, current.classificationArtifactId, next);
    await this.interpretations.advance({ projectId, inputId, baseVersion: body.baseVersion as number, artifactId: artifact.id, editorId, patch: body as Prisma.InputJsonObject, ...(typeof body.note === 'string' && body.note.trim() ? { summary: body.note.trim().slice(0, 500) } : {}) });
    await this.interpretations.markProjectInterpreted(projectId, next.version);
    return this.get(projectId, inputId);
  }

  history(projectId: string, inputId: string) { return this.interpretations.history(projectId, inputId); }

  private async createInitial(projectId: string, inputId: string, classificationArtifactId: string, classification: InputClassification) {
    const source = classification.sourceType[0]?.value ?? 'unknown';
    const scope = classification.musicScope[0]?.value ?? 'unknown';
    const auto = classification.reviewRecommendation === 'auto_accept' && !config.analysis.mandatoryReview;
    const interpretation: InputInterpretation = { schemaVersion: ANALYSIS_SCHEMA_VERSION, inputId, version: 1, sourceType: source, musicScope: scope, intendedUses: [], suggestedUses: this.suggestions(source), origins: { sourceType: 'inferred', musicScope: 'inferred', intendedUses: 'inferred' }, reviewStatus: auto ? 'auto_accepted' : 'needs_review', classificationArtifactId, warnings: [...classification.warnings, ...classification.conflicts], actor: 'aria-analysis', createdAt: new Date().toISOString() };
    const artifact = await this.writeInterpretation(projectId, inputId, classificationArtifactId, interpretation);
    await this.interpretations.createInitial(inputId, artifact.id);
    return interpretation;
  }

  private async writeInterpretation(projectId: string, inputId: string, classificationArtifactId: string, payload: InputInterpretation) {
    const bytes = Buffer.from(JSON.stringify(payload));
    const artifact = await this.artifacts.createArtifactVersion({ projectId, type: ArtifactType.ANALYSIS, namespace: ArtifactNamespace.ANALYSIS, logicalName: `input-interpretation-${inputId}`, fileName: 'interpretation.json', mimeType: 'application/json', retentionClass: RetentionClass.INTERMEDIATE, parentArtifactId: classificationArtifactId, dependencies: [{ artifactId: classificationArtifactId, kind: DependencyKind.DERIVED_FROM }], pipelinePhase: 'interpretation', provenance: { producer: payload.actor, producerVersion: '2.0.0', sourceArtifactIds: [classificationArtifactId], parameters: {}, generatedAt: payload.createdAt }, payload: payload as unknown as Prisma.InputJsonObject });
    await this.objects.putBytes(artifact.objectKey, bytes, artifact.mimeType);
    await this.artifacts.markAvailable(artifact.id, { checksumSha256: createHash('sha256').update(bytes).digest('hex'), fileSize: BigInt(bytes.length) });
    return artifact;
  }

  private enumValue<T extends string>(value: unknown, allowed: readonly T[], field: string): T { if (typeof value !== 'string' || !allowed.includes(value as T)) throw new BadRequestException(`Unsupported ${field}`); return value as T; }
  private useValues(value: unknown): IntendedUse[] { if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !INTENDED_USES.includes(item as IntendedUse))) throw new BadRequestException('intendedUses contains an unsupported value'); return [...new Set(value as IntendedUse[])]; }
  private suggestions(source: SourceType): Array<{ value: IntendedUse; reason: string }> { const map: Partial<Record<SourceType, IntendedUse[]>> = { speech: ['transcribe_lyrics'], singing: ['transcribe_lyrics', 'extract_melody', 'use_as_vocal_performance'], humming: ['extract_melody', 'continue_recording'], solo_instrument: ['extract_melody', 'use_as_instrument_performance'], mixed_music: ['use_as_style_reference'], beatboxing: ['use_as_vocal_performance'] }; return (map[source] ?? []).map((value) => ({ value, reason: `Suggested for detected ${source.replaceAll('_', ' ')}` })); }
  private compatibilityWarnings(source: SourceType, uses: IntendedUse[]): string[] { const warnings: string[] = []; if (uses.includes('use_as_vocal_performance') && !['singing', 'beatboxing', 'speech'].includes(source)) warnings.push('vocal_use_may_not_match_source'); if (uses.includes('use_as_instrument_performance') && source !== 'solo_instrument') warnings.push('instrument_use_may_not_match_source'); return warnings; }
}
