const assert = require('node:assert/strict');
const test = require('node:test');

const { UnderstandingService } = require('../dist/understanding/understanding.service');

test('FR-009 marks understanding stale when interpretation version advances', async () => {
  const payload = {
    schemaVersion: '3.0.0',
    inputId: 'input-1',
    version: 1,
    global: { durationSeconds: 10, semanticTags: ['mixed_music'] },
    sections: [],
    modules: { timing: { status: 'complete', confidence: 'high', summary: {}, warnings: [] } },
    fusion: { uncertainties: [], conflicts: [] },
    lineage: {
      inputId: 'input-1',
      workingArtifactId: 'working-1',
      interpretationArtifactId: 'interpretation-1',
      interpretationVersion: 1,
      sourceArtifactIds: [],
    },
    createdAt: '2026-07-22T00:00:00.000Z',
  };
  const artifacts = {
    getProject: async () => ({ id: 'project-1', metadata: { inputId: 'input-1' }, artifacts: [] }),
    getArtifact: async (id) => ({ id, projectId: 'project-1', type: 'AUDIO_UNDERSTANDING', status: 'AVAILABLE', checksumSha256: 'abc', objectKey: 'understanding.json', payload, mimeType: 'application/json' }),
  };
  const objects = {
    signDownload: async () => ({ url: 'https://example.test/download', expiresAt: new Date().toISOString(), headers: {} }),
  };
  const interpretations = {
    get: async () => ({
      version: 2,
      activeArtifactId: 'interpretation-2',
      activeArtifact: {
        id: 'interpretation-2',
        status: 'AVAILABLE',
        payload: { version: 2, reviewStatus: 'user_corrected' },
      },
    }),
  };
  const understandingRepo = {
    getHead: async () => ({
      version: 1,
      interpretationVersion: 1,
      interpretationArtifactId: 'interpretation-1',
      activeArtifactId: 'understanding-1',
      activeArtifact: { id: 'understanding-1', status: 'AVAILABLE', payload },
    }),
    findHead: async () => null,
  };
  const service = new UnderstandingService(artifacts, objects, interpretations, understandingRepo, {}, {});
  const summary = await service.getLatest('project-1', 'input-1');
  assert.equal(summary.stale, true);
  assert.equal(summary.download.url, 'https://example.test/download');
});

test('FR-009 returns not found when no head exists', async () => {
  const service = new UnderstandingService({}, {}, {}, {
    getHead: async () => {
      const error = new Error('not found');
      error.response = { code: 'AUDIO_UNDERSTANDING_NOT_FOUND' };
      throw error;
    },
  }, {}, {});
  await assert.rejects(() => service.getLatest('project-1', 'input-1'));
});
