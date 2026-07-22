const assert = require('node:assert/strict');
const test = require('node:test');

const { UNDERSTANDING_SCHEMA_VERSION, APPROVED_INTERPRETATION_STATUSES } = require('../dist/understanding/understanding.contracts');
const { serializeUnderstandingSummary } = require('../dist/understanding/serialize-understanding');
const { WorkflowRunService } = require('../dist/workflows/workflow-run.service');

test('understanding contract uses schema version 3.0.0', () => {
  assert.equal(UNDERSTANDING_SCHEMA_VERSION, '3.0.0');
  assert.deepEqual([...APPROVED_INTERPRETATION_STATUSES], ['auto_accepted', 'user_confirmed', 'user_corrected']);
});

test('serializeUnderstandingSummary exposes summary without object keys', () => {
  const payload = {
    schemaVersion: '3.0.0',
    inputId: 'input-1',
    version: 1,
    global: { durationSeconds: 30, semanticTags: ['mixed_music'] },
    sections: [{ id: 'section-1', startSeconds: 0, endSeconds: 30 }],
    modules: {
      timing: { status: 'complete', confidence: 'high', summary: { tempo: { bpm: 120, confidence: 'high' } }, warnings: [] },
      melody: { status: 'abstained', confidence: 'none', summary: {}, warnings: ['melody_abstained'] },
    },
    fusion: { uncertainties: [], conflicts: [] },
    lineage: {
      inputId: 'input-1',
      workingArtifactId: 'working-1',
      interpretationArtifactId: 'interp-1',
      interpretationVersion: 2,
      sourceArtifactIds: [],
    },
    createdAt: '2026-07-22T00:00:00.000Z',
  };
  const summary = serializeUnderstandingSummary({
    artifactId: 'understanding-1',
    payload,
    stale: false,
    download: { url: 'https://example.test/file', expiresAt: '2026-07-22T01:00:00.000Z', checksumSha256: 'abc' },
  });
  assert.equal(summary.artifactId, 'understanding-1');
  assert.equal(summary.sectionCount, 1);
  assert.equal(summary.modules.timing.status, 'complete');
  assert.equal(summary.download.url, 'https://example.test/file');
  assert.equal(JSON.stringify(summary).includes('objectKey'), false);
});

test('workflow run service marks partial success', async () => {
  const updates = [];
  const runs = {
    create: async (input) => ({ id: 'run-1', projectId: input.projectId, kind: 'AUDIO_UNDERSTANDING', status: 'RUNNING', stage: 'preparing', progress: 0, correlationId: input.correlationId ?? null, inputManifestId: input.inputManifestId ?? null, resultArtifactId: null, error: null, metadata: {}, startedAt: new Date(), finishedAt: null, createdAt: new Date(), updatedAt: new Date() }),
    get: async () => ({ id: 'run-1', projectId: 'project-1', kind: 'AUDIO_UNDERSTANDING', status: 'PARTIAL', stage: 'complete', progress: 100, correlationId: 'corr-1', inputManifestId: 'input-1', resultArtifactId: 'artifact-1', error: null, metadata: {}, startedAt: new Date(), finishedAt: new Date(), createdAt: new Date(), updatedAt: new Date() }),
    update: async (runId, data) => { updates.push({ runId, data }); return { id: runId, ...data }; },
  };
  const service = new WorkflowRunService(runs);
  await service.succeed('run-1', 'artifact-1', true);
  assert.equal(updates[0].data.status, 'PARTIAL');
  const serialized = service.serialize(await runs.get());
  assert.equal(serialized.status, 'partial');
});
