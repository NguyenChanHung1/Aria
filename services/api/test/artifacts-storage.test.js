const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
const test = require('node:test');
const { ArtifactNamespace, ArtifactType, PrismaClient, RetentionClass } = require('@prisma/client');
const { ArtifactRepository } = require('../dist/artifacts/artifact.repository');
const { S3ObjectStorage } = require('../dist/artifacts/object-storage');
const { config } = require('../dist/config');

test('metadata in PostgreSQL and binary in MinIO round-trip through signed URLs', { skip: process.env.RUN_OBJECT_STORAGE_TESTS !== '1' }, async (t) => {
  const prisma = new PrismaClient();
  const repository = new ArtifactRepository(prisma);
  const storage = new S3ObjectStorage();
  const projectId = randomUUID();
  t.after(async () => {
    await prisma.artifactDependency.deleteMany({ where: { artifact: { projectId } } });
    await prisma.artifact.updateMany({ where: { projectId }, data: { parentArtifactId: null } });
    await prisma.artifact.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.$disconnect();
  });

  await repository.createProject({ id: projectId, title: 'MinIO verification' });
  const artifact = await repository.createArtifactVersion({
    projectId, type: ArtifactType.LYRICS, namespace: ArtifactNamespace.LYRICS,
    logicalName: 'signed-round-trip', fileName: 'lyrics.json', mimeType: 'application/json',
    retentionClass: RetentionClass.INTERMEDIATE,
  });
  const binary = Buffer.from('{"line":"hello"}\n');
  const upload = await storage.signUpload(artifact.objectKey, artifact.mimeType, 60);
  const put = await fetch(upload.url, { method: upload.method, headers: upload.headers, body: binary });
  assert.equal(put.status, 200);
  assert.equal(await storage.exists(artifact.objectKey), true);
  await repository.markAvailable(artifact.id, {
    checksumSha256: createHash('sha256').update(binary).digest('hex'), fileSize: BigInt(binary.length),
  });

  const download = await storage.signDownload(artifact.objectKey, 60);
  const get = await fetch(download.url);
  assert.equal(get.status, 200);
  assert.deepEqual(Buffer.from(await get.arrayBuffer()), binary);
  const stored = await prisma.artifact.findUniqueOrThrow({ where: { id: artifact.id } });
  assert.equal(stored.status, 'AVAILABLE');
  assert.equal(stored.objectKey.startsWith('/'), false);
  assert.equal(download.url.includes('/data/'), false);
});
