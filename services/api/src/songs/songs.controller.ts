import { Body, Controller, Get, Param, Post, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { diskStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { AgentClient } from '../agent/agent.client';
import { config } from '../config';
import { IngestionService } from '../ingestion/ingestion.service';
import { SongBriefService } from './song-brief.service';
import { ArtifactRepository } from '../artifacts/artifact.repository';

@Controller('songs')
export class SongsController {
  constructor(
    private readonly agent: AgentClient,
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
      await this.projects.createProject({ id: projectId, title: typeof body.title === 'string' ? body.title : undefined });
      let publicInput: Record<string, unknown> | undefined;
      let agentInput: Record<string, unknown> | undefined;
      if (media) {
        const controller = new AbortController();
        const abort = () => controller.abort();
        request.once('aborted', abort);
        try {
          ingestionStarted = true;
          const result = await this.ingestion.ingest(projectId, media, body.media_purpose ?? body.mediaPurpose, controller.signal);
          publicInput = this.ingestion.publicResult(result);
          agentInput = this.ingestion.toAgentAsset(result);
        } finally {
          request.removeListener('aborted', abort);
        }
      }
      const created = await this.agent.createSong({ ...brief, project_id: projectId }, agentInput);
      return { ...(created as Record<string, unknown>), input_asset: publicInput ?? null };
    } catch (error) {
      if (media && !ingestionStarted) await rm(media.path, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  @Get(':id')
  async getSong(@Param('id') id: string) {
    return this.agent.get(`/songs/${encodeURIComponent(id)}`).then((response) => response.json());
  }

  @Get(':id/events')
  async events(@Param('id') id: string, @Res() response: Response) {
    const upstream = await this.agent.get(`/songs/${encodeURIComponent(id)}/events`);
    response.status(200).set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    (await this.agent.stream(upstream)).pipe(response);
  }

  @Get(':id/assets/:asset')
  async asset(@Param('id') id: string, @Param('asset') asset: string, @Res() response: Response) {
    const upstream = await this.agent.get(`/songs/${encodeURIComponent(id)}/assets/${encodeURIComponent(asset)}`);
    response.status(upstream.status);
    upstream.headers.forEach((value, key) => response.setHeader(key, value));
    (await this.agent.stream(upstream)).pipe(response);
  }
}
