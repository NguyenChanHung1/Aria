const assert = require('node:assert/strict');
const test = require('node:test');

const { AnalysisService } = require('../dist/analysis/analysis.service');

function fixture() {
  const current = {
    schemaVersion: '2.0.0', inputId: 'input-1', version: 1, sourceType: 'speech', musicScope: 'fragment',
    intendedUses: [], suggestedUses: [{ value: 'transcribe_lyrics', reason: 'speech' }],
    origins: { sourceType: 'inferred', musicScope: 'inferred', intendedUses: 'inferred' }, reviewStatus: 'needs_review',
    classificationArtifactId: 'classification-1', warnings: [], actor: 'aria-analysis', createdAt: new Date().toISOString(),
  };
  const writes = [];
  const artifacts = {
    getArtifact: async (id) => ({
      payload: id === 'classification-1'
        ? { sourceType: [{ value: 'speech', probability: 0.6 }], reviewRecommendation: 'needs_review', warnings: ['low_snr'], conflicts: [] }
        : {},
    }),
    createArtifactVersion: async (input) => ({ ...input, id: 'interpretation-2', objectKey: 'test/interpretation-2.json' }),
    markAvailable: async () => undefined,
  };
  const objects = { putBytes: async (...args) => writes.push(args) };
  const interpretations = {
    get: async () => ({ version: 1, activeArtifactId: 'interpretation-1', activeArtifact: { id: 'interpretation-1', payload: current } }),
    advance: async (input) => writes.push(input),
    markProjectInterpreted: async (...args) => writes.push(args),
    history: async () => [],
  };
  const invalidation = { markStaleDependents: async () => ['requirements-1'] };
  return { service: new AnalysisService(artifacts, objects, interpretations, invalidation), writes };
}

test('FR-006 user correction creates the next interpretation and relevant suggestions', async () => {
  const { service, writes } = fixture();
  const result = await service.correct('project-1', 'input-1', {
    baseVersion: 1, sourceType: 'solo_instrument', intendedUses: ['extract_melody', 'use_as_instrument_performance'],
  }, 'editor-1');
  assert.equal(result.interpretation.sourceType, 'speech');
  assert.deepEqual(result.staleArtifactIds, ['requirements-1']);
  const persisted = JSON.parse(Buffer.from(writes[0][1]).toString());
  assert.equal(persisted.version, 2);
  assert.equal(persisted.sourceType, 'solo_instrument');
  assert.deepEqual(persisted.suggestedUses.map((item) => item.value), ['extract_melody', 'use_as_instrument_performance']);
  assert.equal(writes[1].baseVersion, 1);
});

test('FR-006 get includes evidence summary from classification artifact', async () => {
  const { service } = fixture();
  const result = await service.get('project-1', 'input-1');
  assert.equal(result.evidenceSummary.topSourceType, 'speech');
  assert.equal(result.evidenceSummary.topSourceProbability, 0.6);
  assert.equal(result.evidenceSummary.warningCount, 1);
});

test('FR-007 correction rejects stale versions and unknown taxonomy values', async () => {
  const { service } = fixture();
  await assert.rejects(() => service.correct('project-1', 'input-1', { baseVersion: 0 }, 'editor-1'), /changed/);
  await assert.rejects(() => service.correct('project-1', 'input-1', { baseVersion: 1, sourceType: 'music-ish' }, 'editor-1'), /Unsupported sourceType/);
});
