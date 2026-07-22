import { AudioUnderstanding, ModuleResult, UnderstandingSummary } from './understanding.contracts';

export function serializeUnderstandingSummary(input: {
  artifactId: string;
  payload: AudioUnderstanding;
  stale: boolean;
  download?: UnderstandingSummary['download'];
}): UnderstandingSummary {
  const { payload } = input;
  const modules = Object.fromEntries(
    Object.entries(payload.modules).map(([name, module]) => [
      name,
      {
        status: (module as ModuleResult).status,
        confidence: (module as ModuleResult).confidence,
        warnings: (module as ModuleResult).warnings,
      },
    ]),
  );
  return {
    artifactId: input.artifactId,
    version: payload.version,
    inputId: payload.inputId,
    stale: input.stale,
    createdAt: payload.createdAt,
    interpretationArtifactId: payload.lineage.interpretationArtifactId,
    interpretationVersion: payload.lineage.interpretationVersion,
    workingArtifactId: payload.lineage.workingArtifactId,
    global: payload.global,
    sectionCount: payload.sections.length,
    modules,
    fusion: payload.fusion,
    ...(input.download ? { download: input.download } : {}),
  };
}
