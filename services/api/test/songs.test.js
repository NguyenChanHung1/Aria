const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');

const { SongBriefService } = require('../dist/songs/song-brief.service');
const { SongsController } = require('../dist/songs/songs.controller');

function request() {
  return new EventEmitter();
}

test('text-only song compatibility endpoint creates a persisted draft without an agent', async () => {
  const created = [];
  const projects = {
    createProject: async (input) => created.push(input),
    getProject: async () => undefined,
    updateProjectState: async () => undefined,
  };
  const controller = new SongsController({}, new SongBriefService(), projects);
  const response = await controller.createSong({ idea: 'A quiet summer evening' }, undefined, request());

  assert.equal(response.stage, 'draft');
  assert.equal(response.project.stage, 'draft');
  assert.equal(response.input_asset, null);
  assert.equal(created.length, 1);
  assert.equal(created[0].metadata.stage, 'draft');
  assert.equal(created[0].metadata.brief.idea, 'A quiet summer evening');
});

test('accepted media advances the persisted project to input_ready', async () => {
  const updates = [];
  const ingestionResult = { manifestRef: 'artifact:input', inputId: 'input', workingArtifactId: 'working' };
  const ingestion = {
    ingest: async () => ingestionResult,
    publicResult: () => ({ manifestRef: ingestionResult.manifestRef }),
  };
  const projects = {
    createProject: async () => undefined,
    getProject: async () => undefined,
    updateProjectState: async (...args) => updates.push(args),
  };
  const analysis = { analyze: async () => null };
  const controller = new SongsController(ingestion, new SongBriefService(), projects, analysis);
  const response = await controller.createSong(
    { idea: 'Interpret this humming', media_purpose: 'voice' },
    { path: '/tmp/already-managed-upload' },
    request(),
  );

  assert.equal(response.stage, 'input_ready');
  assert.equal(response.input_asset.manifestRef, ingestionResult.manifestRef);
  assert.equal(updates.length, 1);
  assert.equal(updates[0][2].stage, 'input_ready');
  assert.equal(updates[0][2].inputManifestRef, ingestionResult.manifestRef);
});

test('song compatibility read returns PostgreSQL project and artifact state', async () => {
  const now = new Date('2026-07-14T00:00:00Z');
  const projects = {
    createProject: async () => undefined,
    updateProjectState: async () => undefined,
    getProject: async () => ({
      id: 'project-1',
      status: 'ACTIVE',
      metadata: { stage: 'input_ready', brief: { idea: 'Reference input' } },
      artifacts: [{ id: 'artifact-1' }],
      createdAt: now,
      updatedAt: now,
    }),
  };
  const controller = new SongsController({}, new SongBriefService(), projects);
  const response = await controller.getSong('project-1');

  assert.equal(response.project.stage, 'input_ready');
  assert.equal(response.project.status, 'active');
  assert.equal(response.project.artifacts.length, 1);
});
