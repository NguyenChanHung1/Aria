import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { ProjectsService } from './projects.service';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Post()
  async create(@Body() body: Record<string, unknown>) {
    const project = await this.projects.createWithBrief(body);
    return { project };
  }

  @Get(':projectId')
  async get(@Param('projectId') projectId: string) {
    const project = await this.projects.getProject(projectId);
    if (!project) throw new NotFoundException({ code: 'PROJECT_NOT_FOUND', message: 'Project not found' });
    return project;
  }
}
