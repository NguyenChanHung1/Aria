const assert = require('node:assert/strict');
const test = require('node:test');

const {
  ArtifactNamespace,
  ArtifactStatus,
  ArtifactType,
  DependencyKind,
  RetentionClass,
} = require('@prisma/client');
const { ArtifactRepository } = require('../dist/artifacts/artifact.repository');
const { ARTIFACT_NAMESPACES, ARTIFACT_SCHEMA_VERSION } = require('../dist/artifacts/artifact.contracts');
const { artifactObjectKey, S3ObjectStorage } = require('../dist/artifacts/object-storage');
const { config } = require('../dist/config');

function fakePrisma() {
  const state = { projects: new Map(), artifacts: [], dependencies: [] };
  const tx = {
    project: {
      findUnique: async ({ where }) => state.projects.has(where.id) ? { id: where.id } : null,
    },
    artifact: {
      findFirst: async ({ where }) => state.artifacts
        .filter((item) => item.projectId === where.projectId && item.type === where.type && item.logicalName === where.logicalName)
        .sort((a, b) => b.version - a.version)[0] ?? null,
      create: async ({ data }) => {
        const artifact = { ...data, createdAt: new Date(), updatedAt: new Date() };
        state.artifacts.push(artifact);
        return artifact;
      },
      findUnique: async ({ where }) => state.artifacts.find((item) => item.id === where.id) ?? null,
      count: async ({ where }) => where.id?.in
        ? state.artifacts.filter((item) => where.id.in.includes(item.id) && item.projectId === where.projectId).length
        : state.artifacts.filter((item) => item.parentArtifactId === where.parentArtifactId && item.status !== ArtifactStatus.DELETED).length,
      update: async ({ where, data }) => Object.assign(state.artifacts.find((item) => item.id === where.id), data),
    },
    artifactDependency: {
      createMany: async ({ data }) => { state.dependencies.push(...data); },
      count: async ({ where }) => state.dependencies.filter((item) => item.dependsOnId === where.dependsOnId && state.artifacts.find((artifact) => artifact.id === item.artifactId)?.status !== ArtifactStatus.DELETED).length,
    },
    $executeRaw: async () => 1,
  };
  return {
    state,
    project: {
      create: async ({ data }) => { const project = { id: data.id ?? crypto.randomUUID(), ...data }; state.projects.set(project.id, project); return project; },
      findUnique: async ({ where }) => {
        const project = state.projects.get(where.id);
        return project ? { ...project, artifacts: state.artifacts.filter((item) => item.projectId === where.id) } : null;
      },
    },
    humanEdit: { create: async ({ data }) => data },
    artifact: tx.artifact,
    $transaction: async (callback) => callback(tx),
  };
}

test('versioned schemas expose every Phase 0 artifact namespace', () => {
  assert.equal(ARTIFACT_SCHEMA_VERSION, '1.0.0');
  assert.deepEqual(ARTIFACT_NAMESPACES, [
    'originals', 'normalized-audio', 'analysis', 'requirements', 'creative-direction',
    'blueprints', 'lyrics', 'scores', 'arrangements', 'performances', 'stems',
    'mixes', 'masters', 'reviews', 'previews', 'exports',
  ]);
});

test('immutable keys are provider-neutral and reject path traversal', () => {
  const key = artifactObjectKey({ projectId: 'project-1', namespace: 'lyrics', artifactId: 'artifact-1', fileName: 'lyrics.json' });
  assert.equal(key, 'projects/project-1/lyrics/artifact-1/lyrics.json');
  assert.equal(key.startsWith('/'), false);
  assert.throws(() => artifactObjectKey({ projectId: '../escape', namespace: 'lyrics', artifactId: 'a', fileName: 'lyrics.json' }), /Invalid project ID/);
  assert.throws(() => artifactObjectKey({ projectId: 'p', namespace: 'lyrics', artifactId: 'a', fileName: '../secret' }), /Invalid file name/);
});

test('repository versions deliverables independently and records lineage', async () => {
  const prisma = fakePrisma();
  const repository = new ArtifactRepository(prisma);
  const project = await repository.createProject({ id: '334f8354-dbb7-4f7b-a8d3-f0b1692debad' });
  const source = await repository.createArtifactVersion({
    projectId: project.id, type: ArtifactType.SOURCE_MEDIA, namespace: ArtifactNamespace.ORIGINALS,
    logicalName: 'reference', fileName: 'input.wav', mimeType: 'audio/wav', retentionClass: RetentionClass.ORIGINAL,
  });
  const lyricsV1 = await repository.createArtifactVersion({
    projectId: project.id, type: ArtifactType.LYRICS, namespace: ArtifactNamespace.LYRICS,
    logicalName: 'draft-lyrics', fileName: 'lyrics.json', mimeType: 'application/json', retentionClass: RetentionClass.INTERMEDIATE,
    parentArtifactId: source.id, dependencies: [{ artifactId: source.id, kind: DependencyKind.DERIVED_FROM }],
  });
  const lyricsV2 = await repository.createArtifactVersion({
    projectId: project.id, type: ArtifactType.LYRICS, namespace: ArtifactNamespace.LYRICS,
    logicalName: 'draft-lyrics', fileName: 'lyrics.json', mimeType: 'application/json', retentionClass: RetentionClass.INTERMEDIATE,
    parentArtifactId: lyricsV1.id,
  });
  const instrumental = await repository.createArtifactVersion({
    projectId: project.id, type: ArtifactType.MIX, namespace: ArtifactNamespace.MIXES,
    logicalName: 'draft-instrumental', fileName: 'instrumental.wav', mimeType: 'audio/wav', retentionClass: RetentionClass.INTERMEDIATE,
  });
  const composed = await repository.createArtifactVersion({
    projectId: project.id, type: ArtifactType.MIX, namespace: ArtifactNamespace.MIXES,
    logicalName: 'draft-composed-song', fileName: 'composed.wav', mimeType: 'audio/wav', retentionClass: RetentionClass.INTERMEDIATE,
    dependencies: [{ artifactId: lyricsV2.id, kind: DependencyKind.COMPOSES }, { artifactId: instrumental.id, kind: DependencyKind.COMPOSES }],
  });

  assert.equal(lyricsV1.version, 1);
  assert.equal(lyricsV2.version, 2);
  assert.equal(instrumental.version, 1);
  assert.equal(composed.version, 1);
  assert.equal(prisma.state.dependencies.length, 3);
  await assert.rejects(() => repository.protectivelyDelete(source.id), /retention protected/);
  await assert.rejects(() => repository.protectivelyDelete(lyricsV2.id), /active descendants/);
});

test('signed URL contract returns no host filesystem paths', async () => {
  const previous = config.objectStorage.publicEndpoint;
  config.objectStorage.publicEndpoint = 'http://localhost:9000';
  try {
    const storage = new S3ObjectStorage();
    const signed = await storage.signUpload('projects/p/originals/a/input.wav', 'audio/wav', 60);
    assert.equal(signed.method, 'PUT');
    assert.match(signed.url, /^http:\/\/localhost:9000\/aria-artifacts\/projects\/p\/originals\/a\/input\.wav\?/);
    assert.equal(signed.url.includes('/data/'), false);
  } finally {
    config.objectStorage.publicEndpoint = previous;
  }
});
