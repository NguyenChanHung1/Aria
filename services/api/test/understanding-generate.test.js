const assert = require('node:assert/strict');
const test = require('node:test');

process.env.UNDERSTANDING_ENABLED = 'true';

const { UnderstandingService } = require('../dist/understanding/understanding.service');

function approvedInterpretation(overrides = {}) {
  return {
    schemaVersion: '2.0.0',
    inputId: 'input-1',
    version: 2,
    sourceType: 'mixed_music',
    musicScope: 'full_song',
    intendedUses: ['use_as_style_reference'],
    suggestedUses: [],
    origins: { sourceType: 'user', musicScope: 'inferred', intendedUses: 'inferred' },
    reviewStatus: 'user_confirmed',
    classificationArtifactId: 'classification-1',
    warnings: [],
    actor: 'editor-1',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function fixture() {
  const interpretation = approvedInterpretation();
  const artifacts = {
    getProject: async () => ({ id: 'project-1', metadata: { inputId: 'input-1' }, artifacts: [] }),
    getArtifact: async (id) => {
      if (id === 'input-1') return { id, projectId: 'project-1', type: 'INPUT_MANIFEST', status: 'AVAILABLE', payload: { workingArtifactId: 'working-1' } };
      if (id === 'working-1') return { id, projectId: 'project-1', type: 'NORMALIZED_AUDIO', status: 'AVAILABLE', checksumSha256: 'abc', objectKey: 'working.wav', mimeType: 'audio/wav' };
      return null;
    },
    findLatestAvailable: async () => null,
    createArtifactVersion: async (input) => ({ ...input, id: `${input.logicalName}-id`, objectKey: `${input.logicalName}.json`, mimeType: input.mimeType }),
    markAvailable: async () => undefined,
    markFailed: async () => undefined,
    markSuperseded: async () => undefined,
  };
  const objects = {
    signInternalDownload: async () => ({ url: 'https://worker/source', headers: {} }),
    signInternalUpload: async () => ({ url: 'https://worker/upload', headers: { 'content-type': 'application/json' } }),
    signDownload: async () => ({ url: 'https://client/download', expiresAt: new Date().toISOString(), headers: {} }),
    checksumAndSize: async () => ({ checksumSha256: 'deadbeef', fileSize: 128 }),
  };
  const interpretations = {
    get: async () => ({
      version: 2,
      activeArtifactId: 'interpretation-1',
      activeArtifact: { id: 'interpretation-1', payload: interpretation, status: 'AVAILABLE' },
    }),
  };
  const understandingRepo = {
    findHead: async () => null,
    getHead: async () => { throw new Error('not found'); },
    createInitial: async (input) => input,
    advance: async () => ({ count: 1 }),
  };
  const workflowRuns = {
    createAudioUnderstandingRun: async () => ({
      id: 'run-1', projectId: 'project-1', kind: 'AUDIO_UNDERSTANDING', status: 'RUNNING', stage: 'preparing', progress: 0,
      correlationId: 'corr', inputManifestId: 'input-1', resultArtifactId: null, error: null, metadata: {}, startedAt: new Date(), finishedAt: null,
    }),
    serialize: (run) => ({ id: run.id, status: 'running', stage: run.stage, progress: run.progress }),
    updateStage: async () => undefined,
    succeed: async () => undefined,
    fail: async () => undefined,
  };
  const analysis = {
    analyze: async () => interpretation,
  };
  return {
    service: new UnderstandingService(artifacts, objects, interpretations, understandingRepo, workflowRuns, analysis),
    interpretation,
  };
}

test('FR-008 rejects generation when interpretation is not approved', async () => {
  const { service, interpretation } = fixture();
  service['interpretations'].get = async () => ({
    version: 1,
    activeArtifactId: 'interpretation-1',
    activeArtifact: { id: 'interpretation-1', payload: { ...interpretation, reviewStatus: 'needs_review' }, status: 'AVAILABLE' },
  });
  await assert.rejects(
    () => service.startGeneration('project-1', { inputId: 'input-1' }),
    (error) => {
      const response = typeof error.getResponse === 'function' ? error.getResponse() : error.response;
      return response?.code === 'INTERPRETATION_NOT_APPROVED' || /approved/i.test(String(error.message));
    },
  );
});

test('FR-008 startGeneration returns workflow run for approved interpretation', async () => {
  const { service } = fixture();
  const result = await service.startGeneration('project-1', { inputId: 'input-1' }, 'corr-1');
  assert.equal(result.reused, false);
  assert.equal(result.workflowRun.id, 'run-1');
});
