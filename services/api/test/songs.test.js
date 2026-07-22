const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');

const { BriefService } = require('../dist/projects/brief.service');
const { ProjectsService } = require('../dist/projects/projects.service');
const { SongsController } = require('../dist/songs/songs.controller');

function request() {
  return new EventEmitter();
}

test('text-only song compatibility endpoint creates a persisted draft without an agent', async () => {
  const created = [];
  const artifacts = {
    createProject: async (input) => { created.push(input); return { id: input.id, schemaVersion: '1.0.0', status: 'DRAFT', title: input.title ?? null, metadata: input.metadata, createdAt: new Date(), updatedAt: new Date() }; },
    getProject: async () => undefined,
    updateProjectState: async () => undefined,
  };
  const projects = new ProjectsService(artifacts, new BriefService());
  const controller = new SongsController({}, new BriefService(), projects, artifacts, { analyze: async () => null });
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
  const artifacts = {
    createProject: async (input) => ({ id: input.id, schemaVersion: '1.0.0', status: 'DRAFT', title: null, metadata: input.metadata, createdAt: new Date(), updatedAt: new Date() }),
    getProject: async () => undefined,
    updateProjectState: async (...args) => updates.push(args),
  };
  const projects = new ProjectsService(artifacts, new BriefService());
  const analysis = { analyze: async () => null };
  const controller = new SongsController(ingestion, new BriefService(), projects, artifacts, analysis);
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
  const artifacts = {
    getProject: async () => ({
      id: 'project-1',
      schemaVersion: '1.0.0',
      status: 'ACTIVE',
      title: null,
      metadata: { stage: 'input_ready', brief: { idea: 'Reference input', briefSchemaVersion: '1.1.0', mood: 'pop', genre: 'pop', length: 'medium', vocal_style: 'female', language: 'en', audience: null, deliverables: [] } },
      artifacts: [{ id: 'artifact-1', fileSize: null, objectKey: 'hidden' }],
      createdAt: now,
      updatedAt: now,
    }),
  };
  const projects = new ProjectsService(artifacts, new BriefService());
  const controller = new SongsController({}, new BriefService(), projects, artifacts, { analyze: async () => null });
  const response = await controller.getSong('project-1');

  assert.equal(response.project.stage, 'input_ready');
  assert.equal(response.project.status, 'active');
  assert.equal(response.project.artifacts.length, 1);
});
