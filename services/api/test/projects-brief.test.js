const assert = require('node:assert/strict');
const test = require('node:test');

const { BriefService } = require('../dist/projects/brief.service');
const { ProjectsService } = require('../dist/projects/projects.service');
const { ProjectsController } = require('../dist/projects/projects.controller');

test('FR-001 text-only project via POST /projects persists brief fields', async () => {
  const created = [];
  const artifacts = {
    createProject: async (input) => {
      const project = { id: input.id ?? 'project-1', schemaVersion: '1.0.0', status: 'DRAFT', title: input.title ?? null, metadata: input.metadata, createdAt: new Date(), updatedAt: new Date() };
      created.push(project);
      return project;
    },
    getProject: async () => null,
  };
  const service = new ProjectsService(artifacts, new BriefService());
  const controller = new ProjectsController(service);
  const response = await controller.create({
    idea: 'A quiet summer evening',
    mood: 'chill',
    genre: 'folk',
    audience: 'indie listeners',
    deliverables: ['master', 'lyrics'],
  });

  assert.equal(response.project.stage, 'draft');
  assert.equal(response.project.brief.idea, 'A quiet summer evening');
  assert.equal(response.project.brief.audience, 'indie listeners');
  assert.deepEqual(response.project.brief.deliverables, ['master', 'lyrics']);
  assert.equal(created.length, 1);
});

test('FR-001 rejects unsupported mood enum with stable error code', () => {
  const briefs = new BriefService();
  assert.throws(() => briefs.create({ idea: 'Valid idea here', mood: 'hyper' }, false), (error) => {
    assert.equal(error.getResponse().code, 'UNSUPPORTED_BRIEF_VALUE');
    return true;
  });
});

test('FR-001 rejects too-short idea', () => {
  const briefs = new BriefService();
  assert.throws(() => briefs.create({ idea: 'no' }, false), (error) => {
    assert.equal(error.getResponse().code, 'INVALID_BRIEF');
    return true;
  });
});
