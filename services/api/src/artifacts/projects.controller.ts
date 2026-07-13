import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { ArtifactRepository } from './artifact.repository';
import { serializeArtifact } from './serialize-artifact';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ArtifactRepository) {}

  @Post()
  create(@Body() body: Record<string, unknown>) {
    const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : undefined;
    return this.projects.createProject({ ...(title ? { title } : {}) });
  }

  @Get(':projectId')
  async get(@Param('projectId') projectId: string) {
    const project = await this.projects.getProject(projectId);
    if (!project) throw new NotFoundException('Project not found');
    return { ...project, artifacts: project.artifacts.map(serializeArtifact) };
  }
}
