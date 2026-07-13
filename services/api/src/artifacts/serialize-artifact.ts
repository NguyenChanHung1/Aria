export function serializeArtifact<T extends { fileSize: bigint | null; objectKey: string }>(artifact: T) {
  const { objectKey: _privateObjectKey, ...publicArtifact } = artifact;
  return { ...publicArtifact, fileSize: artifact.fileSize == null ? null : Number(artifact.fileSize) };
}
