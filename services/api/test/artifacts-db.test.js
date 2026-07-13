const assert = require('node:assert/strict');
const test = require('node:test');
const { randomUUID } = require('node:crypto');
const { ArtifactNamespace, ArtifactType, DependencyKind, PrismaClient, RetentionClass } = require('@prisma/client');
const { ArtifactRepository } = require('../dist/artifacts/artifact.repository');

test('PostgreSQL repository persists versions, lineage, and deletion protection', { skip: process.env.RUN_DATABASE_TESTS !== '1' }, async (t) => {
  const prisma = new PrismaClient();
  const repository = new ArtifactRepository(prisma);
  const projectId = randomUUID();
  t.after(async () => {
    await prisma.review.deleteMany({ where: { projectId } });
    await prisma.humanEdit.deleteMany({ where: { artifact: { projectId } } });
    await prisma.artifactDependency.deleteMany({ where: { artifact: { projectId } } });
    await prisma.artifact.updateMany({ where: { projectId }, data: { parentArtifactId: null } });
    await prisma.artifact.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.$disconnect();
  });

  await repository.createProject({ id: projectId, title: 'Phase 0 integration' });
  const parent = await repository.createArtifactVersion({
    projectId, type: ArtifactType.SOURCE_MEDIA, namespace: ArtifactNamespace.ORIGINALS,
    logicalName: 'source', fileName: 'input.wav', mimeType: 'audio/wav', retentionClass: RetentionClass.ORIGINAL,
  });
  const first = await repository.createArtifactVersion({
    projectId, type: ArtifactType.LYRICS, namespace: ArtifactNamespace.LYRICS,
    logicalName: 'draft-lyrics', fileName: 'lyrics.json', mimeType: 'application/json', retentionClass: RetentionClass.INTERMEDIATE,
    parentArtifactId: parent.id, dependencies: [{ artifactId: parent.id, kind: DependencyKind.DERIVED_FROM }],
  });
  const second = await repository.createArtifactVersion({
    projectId, type: ArtifactType.LYRICS, namespace: ArtifactNamespace.LYRICS,
    logicalName: 'draft-lyrics', fileName: 'lyrics.json', mimeType: 'application/json', retentionClass: RetentionClass.INTERMEDIATE,
    parentArtifactId: first.id,
  });

  assert.equal(first.version, 1);
  assert.equal(second.version, 2);
  assert.notEqual(first.objectKey, second.objectKey);
  await assert.rejects(() => repository.protectivelyDelete(parent.id), /retention protected/);
  await assert.rejects(() => repository.protectivelyDelete(first.id), /active descendants/);
});
