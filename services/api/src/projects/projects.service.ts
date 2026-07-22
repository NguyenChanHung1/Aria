import { Injectable } from '@nestjs/common';
import { Prisma, ProjectStatus } from '@prisma/client';
import { ArtifactRepository } from '../artifacts/artifact.repository';
import { BriefService, type ProjectBrief } from './brief.service';
import { serializeProject } from './serialize-project';

@Injectable()
export class ProjectsService {
  constructor(private readonly artifacts: ArtifactRepository, private readonly briefs: BriefService) {}

  async createWithBrief(body: Record<string, unknown>, options: { id?: string; hasMedia?: boolean } = {}) {
    const brief = this.briefs.create(body, Boolean(options.hasMedia));
    const title = brief.title ?? undefined;
    const project = await this.artifacts.createProject({
      ...(options.id ? { id: options.id } : {}),
      ...(title ? { title } : {}),
      metadata: { brief: brief as unknown as Prisma.InputJsonObject, stage: 'draft', briefSchemaVersion: brief.briefSchemaVersion },
    });
    return serializeProject(project, brief);
  }

  async getProject(projectId: string) {
    const project = await this.artifacts.getProject(projectId);
    if (!project) return null;
    const metadata = project.metadata as Record<string, unknown>;
    const brief = (metadata.brief ?? null) as ProjectBrief | null;
    return {
      ...serializeProject(project, brief),
      artifacts: project.artifacts.map((artifact) => {
        const { objectKey: _objectKey, ...rest } = artifact;
        return { ...rest, fileSize: artifact.fileSize == null ? null : Number(artifact.fileSize) };
      }),
    };
  }

  async updateStage(projectId: string, status: ProjectStatus, patch: Record<string, unknown>) {
    const project = await this.artifacts.getProject(projectId);
    if (!project) return null;
    const metadata = project.metadata as Record<string, unknown>;
    await this.artifacts.updateProjectState(projectId, status, { ...metadata, ...patch } as Prisma.InputJsonObject);
    return this.getProject(projectId);
  }
}
