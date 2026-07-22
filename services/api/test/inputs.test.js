const assert = require('node:assert/strict');
const test = require('node:test');

const { InputsService } = require('../dist/inputs/inputs.service');

function fixture() {
  const state = { project: { id: 'project-1', status: 'DRAFT', metadata: { stage: 'draft', brief: { idea: 'test' } } }, artifacts: [], puts: [] };
  const artifacts = {
    getProject: async (id) => (id === 'project-1' ? state.project : null),
    createArtifactVersion: async (input) => {
      const record = { ...input, objectKey: `projects/${input.projectId}/analysis/${input.id}/${input.fileName}`, status: 'PENDING' };
      state.artifacts.push(record);
      return record;
    },
    markAvailable: async (id, meta) => {
      const artifact = state.artifacts.find((item) => item.id === id);
      Object.assign(artifact, meta, { status: 'AVAILABLE' });
    },
    updateProjectState: async (_id, status, metadata) => {
      state.project.status = status;
      state.project.metadata = metadata;
    },
  };
  const objects = {
    putBytes: async (key, body) => state.puts.push({ key, body: body.toString() }),
  };
  return { service: new InputsService(artifacts, objects), state };
}

test('FR-002 text input creates INPUT_MANIFEST artifact', async () => {
  const { service, state } = fixture();
  const result = await service.createTextInput('project-1', { kind: 'lyrics', content: 'Verse one line' });
  assert.equal(result.input.id, result.manifest.id);
  assert.equal(result.input.kind, 'lyrics');
  assert.equal(state.artifacts.length, 1);
  assert.equal(state.project.metadata.inputId, result.input.id);
  assert.match(state.puts[0].body, /Verse one line/);
});

test('FR-002 rejects empty content', async () => {
  const { service } = fixture();
  await assert.rejects(() => service.createTextInput('project-1', { kind: 'text', content: '   ' }), (error) => {
    assert.equal(error.getResponse().code, 'INVALID_INPUT');
    return true;
  });
});

test('FR-002 rejects unknown kind', async () => {
  const { service } = fixture();
  await assert.rejects(() => service.createTextInput('project-1', { kind: 'midi', content: 'data' }), (error) => {
    assert.equal(error.getResponse().code, 'INVALID_INPUT');
    return true;
  });
});
