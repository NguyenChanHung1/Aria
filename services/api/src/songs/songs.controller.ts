import { Body, Controller, Get, NotFoundException, Param, Post, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProjectStatus, Prisma } from '@prisma/client';
import type { Request } from 'express';
import { diskStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { config } from '../config';
import { IngestionService } from '../ingestion/ingestion.service';
import { BriefService } from '../projects/brief.service';
import { ProjectsService } from '../projects/projects.service';
import { ArtifactRepository } from '../artifacts/artifact.repository';
import { AnalysisService } from '../analysis/analysis.service';
import type { InputInterpretation } from '../analysis/analysis.contracts';

@Controller('songs')
export class SongsController {
  constructor(
    private readonly ingestion: IngestionService,
    private readonly briefs: BriefService,
    private readonly projects: ProjectsService,
    private readonly artifacts: ArtifactRepository,
    private readonly analysis: AnalysisService,
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
      const projectId = randomUUID();
      const created = await this.projects.createWithBrief(body, { id: projectId, hasMedia: Boolean(media) });
      let publicInput: Record<string, unknown> | undefined;
      let interpretation: InputInterpretation | null = null;
      if (media) {
        const controller = new AbortController();
        const abort = () => controller.abort();
        request.once('aborted', abort);
        try {
          ingestionStarted = true;
          const result = await this.ingestion.ingest(projectId, media, body.media_purpose ?? body.mediaPurpose, controller.signal);
          publicInput = this.ingestion.publicResult(result);
          interpretation = await this.analysis.analyze(projectId, result.inputId, result.workingArtifactId);
          const inputStage = interpretation?.reviewStatus === 'needs_review' ? 'awaiting_input_review' : interpretation ? 'input_interpreted' : 'input_ready';
          await this.artifacts.updateProjectState(projectId, ProjectStatus.ACTIVE, {
            ...(created.brief ? { brief: created.brief as unknown as Prisma.InputJsonObject } : {}),
            stage: inputStage,
            inputManifestRef: result.manifestRef,
            inputId: result.inputId,
            interpretationVersion: interpretation?.version,
          });
        } finally {
          request.removeListener('aborted', abort);
        }
      }
      const stage = media ? (interpretation?.reviewStatus === 'needs_review' ? 'awaiting_input_review' : interpretation ? 'input_interpreted' : 'input_ready') : 'draft';
      return {
        project_id: projectId,
        stage,
        project: { ...created, stage, artifacts: undefined },
        input_asset: publicInput ?? null,
        interpretation,
      };
    } catch (error) {
      if (media && !ingestionStarted) await rm(media.path, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  @Get(':id')
  async getSong(@Param('id') id: string) {
    const project = await this.projects.getProject(id);
    if (!project) throw new NotFoundException({ code: 'PROJECT_NOT_FOUND', message: 'Project not found' });
    return {
      project: {
        id: project.id,
        stage: project.stage,
        status: project.status,
        brief: project.brief,
        artifacts: project.artifacts ?? [],
        input_id: project.inputId,
        interpretation_version: project.interpretationVersion,
        created_at: project.createdAt,
        updated_at: project.updatedAt,
      },
    };
  }
}
