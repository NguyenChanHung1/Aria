import { Body, Controller, Get, NotFoundException, Param, Post, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Prisma, ProjectStatus } from '@prisma/client';
import type { Request } from 'express';
import { diskStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { config } from '../config';
import { IngestionService } from '../ingestion/ingestion.service';
import { SongBriefService } from './song-brief.service';
import { ArtifactRepository } from '../artifacts/artifact.repository';

@Controller('songs')
export class SongsController {
  constructor(
    private readonly ingestion: IngestionService,
    private readonly briefs: SongBriefService,
    private readonly projects: ArtifactRepository,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('media', {
    storage: diskStorage({ destination: config.tempDir, filename: (_request, _file, callback) => callback(null, `${randomUUID()}.upload`) }),
    limits: { fileSize: config.maxUploadBytes, files: 1, fields: 32, fieldSize: 64 * 1024 },
  }))
  async createSong(
    @Body() body: Record<string, unknown>,
    @UploadedFile() media: Express.Multer.File | undefined,
    @Req() request: Request,
  ) {
    let ingestionStarted = false;
    try {
      const brief = this.briefs.create(body, Boolean(media));
      const projectId = randomUUID();
      const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : undefined;
      await this.projects.createProject({
        id: projectId,
        ...(title ? { title } : {}),
        metadata: { brief: brief as Prisma.InputJsonObject, stage: 'draft' },
      });
      let publicInput: Record<string, unknown> | undefined;
      if (media) {
        const controller = new AbortController();
        const abort = () => controller.abort();
        request.once('aborted', abort);
        try {
          ingestionStarted = true;
          const result = await this.ingestion.ingest(projectId, media, body.media_purpose ?? body.mediaPurpose, controller.signal);
          publicInput = this.ingestion.publicResult(result);
          await this.projects.updateProjectState(projectId, ProjectStatus.ACTIVE, {
            brief: brief as Prisma.InputJsonObject,
            stage: 'input_ready',
            inputManifestRef: result.manifestRef,
          });
        } finally {
          request.removeListener('aborted', abort);
        }
      }
      const stage = media ? 'input_ready' : 'draft';
      return {
        project_id: projectId,
        stage,
        project: { id: projectId, stage, brief },
        input_asset: publicInput ?? null,
      };
    } catch (error) {
      if (media && !ingestionStarted) await rm(media.path, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  @Get(':id')
  async getSong(@Param('id') id: string) {
    const project = await this.projects.getProject(id);
    if (!project) throw new NotFoundException('Project not found');
    const metadata = project.metadata as Record<string, unknown>;
    return {
      project: {
        id: project.id,
        stage: typeof metadata.stage === 'string' ? metadata.stage : project.status.toLowerCase(),
        status: project.status.toLowerCase(),
        brief: metadata.brief ?? null,
        artifacts: project.artifacts,
        created_at: project.createdAt,
        updated_at: project.updatedAt,
      },
    };
  }
}
