const assert = require('node:assert/strict');
const test = require('node:test');

const { ArtifactRepository } = require('../dist/artifacts/artifact.repository');
const { InvalidationService } = require('../dist/artifacts/invalidation.service');
const { ArtifactNamespace, ArtifactStatus, ArtifactType, DependencyKind, RetentionClass } = require('@prisma/client');

function fakePrisma() {
  const state = { projects: new Map(), artifacts: [], dependencies: [] };
  const tx = {
    project: { findUnique: async ({ where }) => (state.projects.has(where.id) ? { id: where.id } : null) },
    artifact: {
      findFirst: async ({ where, orderBy }) => state.artifacts.filter((item) => item.projectId === where.projectId && item.type === where.type && item.logicalName === where.logicalName).sort((a, b) => b.version - a.version)[0] ?? null,
      create: async ({ data }) => { const artifact = { ...data, createdAt: new Date(), updatedAt: new Date() }; state.artifacts.push(artifact); return artifact; },
      findUnique: async ({ where }) => state.artifacts.find((item) => item.id === where.id) ?? null,
      findMany: async ({ where, take }) => {
        let rows = state.artifacts.filter((item) => item.projectId === where.projectId);
        rows.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
        if (where.OR) rows = rows.slice(1);
        return typeof take === 'number' ? rows.slice(0, take) : rows;
      },
      count: async ({ where }) => {
        if (where.id?.in) return state.artifacts.filter((item) => where.id.in.includes(item.id)).length;
        if (where.parentArtifactId) return state.artifacts.filter((item) => item.parentArtifactId === where.parentArtifactId && item.status !== ArtifactStatus.DELETED).length;
        return 0;
      },
      updateMany: async ({ where, data }) => {
        const matches = state.artifacts.filter((item) => item.id === where.id);
        matches.forEach((item) => Object.assign(item, data));
        return { count: matches.length };
      },
      update: async ({ where, data }) => Object.assign(state.artifacts.find((item) => item.id === where.id), data),
    },
    artifactDependency: {
      createMany: async ({ data }) => { state.dependencies.push(...data); },
      findMany: async ({ where }) => state.dependencies.filter((row) => {
        if (where.artifactId) return row.artifactId === where.artifactId;
        if (where.dependsOnId) return row.dependsOnId === where.dependsOnId;
        return false;
      }),
      count: async ({ where }) => state.dependencies.filter((row) => row.dependsOnId === where.dependsOnId).length,
    },
    $executeRaw: async () => 1,
  };
  return {
    state,
    project: {
      create: async ({ data }) => { const project = { id: data.id ?? 'project-1', ...data }; state.projects.set(project.id, project); return project; },
      findUnique: async ({ where, select, include }) => {
        const project = state.projects.get(where.id);
        if (!project) return null;
        if (include?.artifacts) return { ...project, artifacts: state.artifacts.filter((item) => item.projectId === where.id) };
        return select ? { id: project.id } : project;
      },
    },
    artifact: tx.artifact,
    artifactDependency: tx.artifactDependency,
    $transaction: async (callback) => callback(tx),
  };
}

test('FR-005 listArtifacts returns deterministic order with cursor', async () => {
  const prisma = fakePrisma();
  const repository = new ArtifactRepository(prisma);
  await repository.createProject({ id: 'project-1' });
  await repository.createArtifactVersion({ projectId: 'project-1', type: ArtifactType.LYRICS, namespace: ArtifactNamespace.LYRICS, logicalName: 'a', fileName: 'a.json', mimeType: 'application/json', retentionClass: RetentionClass.INTERMEDIATE });
  await repository.createArtifactVersion({ projectId: 'project-1', type: ArtifactType.LYRICS, namespace: ArtifactNamespace.LYRICS, logicalName: 'b', fileName: 'b.json', mimeType: 'application/json', retentionClass: RetentionClass.INTERMEDIATE });
  const page = await repository.listArtifacts('project-1', { limit: 1 });
  assert.equal(page.items.length, 1);
  assert.equal(page.nextCursor !== null, true);
  const page2 = await repository.listArtifacts('project-1', { cursor: page.nextCursor, limit: 10 });
  assert.equal(page2.items.length, 1);
  assert.notEqual(page.items[0].id, page2.items[0].id);
});

test('FR-007 invalidation marks dependent artifacts superseded but protects measurements', async () => {
  const prisma = fakePrisma();
  const repository = new ArtifactRepository(prisma);
  const invalidation = new InvalidationService(repository);
  await repository.createProject({ id: 'project-1' });
  const source = await repository.createArtifactVersion({ projectId: 'project-1', type: ArtifactType.SOURCE_MEDIA, namespace: ArtifactNamespace.ORIGINALS, logicalName: 'source-input', fileName: 'source.wav', mimeType: 'audio/wav', retentionClass: RetentionClass.ORIGINAL });
  const interpretation = await repository.createArtifactVersion({ projectId: 'project-1', type: ArtifactType.ANALYSIS, namespace: ArtifactNamespace.ANALYSIS, logicalName: 'input-interpretation-input-1', fileName: 'interpretation.json', mimeType: 'application/json', retentionClass: RetentionClass.INTERMEDIATE, parentArtifactId: source.id, dependencies: [{ artifactId: source.id, kind: DependencyKind.DERIVED_FROM }] });
  const requirements = await repository.createArtifactVersion({ projectId: 'project-1', type: ArtifactType.REQUIREMENTS, namespace: ArtifactNamespace.REQUIREMENTS, logicalName: 'requirements', fileName: 'requirements.json', mimeType: 'application/json', retentionClass: RetentionClass.INTERMEDIATE, dependencies: [{ artifactId: interpretation.id, kind: DependencyKind.REQUIRES }] });
  await repository.markAvailable(source.id, { checksumSha256: 'a'.repeat(64), fileSize: 1n });
  await repository.markAvailable(interpretation.id, { checksumSha256: 'b'.repeat(64), fileSize: 1n });
  await repository.markAvailable(requirements.id, { checksumSha256: 'c'.repeat(64), fileSize: 1n });

  const stale = await invalidation.markStaleDependents('project-1', interpretation.id);
  assert.deepEqual(stale, [requirements.id]);
  const updatedSource = await repository.getArtifact(source.id);
  const updatedRequirements = await repository.getArtifact(requirements.id);
  assert.equal(updatedSource.status, ArtifactStatus.AVAILABLE);
  assert.equal(updatedRequirements.status, ArtifactStatus.SUPERSEDED);
});
