import type { Project } from '@prisma/client';
import type { ProjectBrief } from './brief.service';

export function serializeProject(project: Project, brief: ProjectBrief | null) {
  const metadata = project.metadata as Record<string, unknown>;
  return {
    id: project.id,
    schemaVersion: project.schemaVersion,
    status: project.status.toLowerCase(),
    stage: typeof metadata.stage === 'string' ? metadata.stage : project.status.toLowerCase(),
    title: project.title,
    brief,
    inputId: typeof metadata.inputId === 'string' ? metadata.inputId : null,
    interpretationVersion: typeof metadata.interpretationVersion === 'number' ? metadata.interpretationVersion : null,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}
