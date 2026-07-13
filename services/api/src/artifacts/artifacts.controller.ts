import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { ArtifactNamespace, ArtifactType, RetentionClass } from '@prisma/client';
import { ArtifactRepository } from './artifact.repository';
import { ObjectStorage } from './object-storage';

@Controller('projects/:projectId/artifacts')
export class ArtifactsController {
  constructor(private readonly artifacts: ArtifactRepository, private readonly storage: ObjectStorage) {}

  @Post('upload-url')
  async uploadUrl(@Param('projectId') projectId: string, @Body() body: Record<string, unknown>) {
    const type = this.enumValue(ArtifactType, body.artifactType, 'artifactType');
    const namespace = this.enumValue(ArtifactNamespace, body.namespace, 'namespace');
    const retentionClass = this.enumValue(RetentionClass, body.retentionClass, 'retentionClass');
    const logicalName = this.text(body.logicalName, 'logicalName');
    const fileName = this.text(body.fileName, 'fileName');
    const contentType = this.text(body.contentType, 'contentType');
    const expiresAt = this.optionalDate(body.expiresAt);
    if (expiresAt && retentionClass !== RetentionClass.PREVIEW) throw new BadRequestException('expiresAt is only allowed for PREVIEW artifacts');
    const artifact = await this.artifacts.createArtifactVersion({ projectId, type, namespace, retentionClass, logicalName, fileName, mimeType: contentType, ...(expiresAt ? { expiresAt } : {}) });
    const upload = await this.storage.signUpload(artifact.objectKey, contentType, this.optionalTtl(body.expiresInSeconds));
    return { artifact: { id: artifact.id, version: artifact.version, status: artifact.status }, upload };
  }

  @Get(':artifactId/download-url')
  async downloadUrl(@Param('projectId') projectId: string, @Param('artifactId') artifactId: string) {
    const project = await this.artifacts.getProject(projectId);
    const artifact = project?.artifacts.find((candidate) => candidate.id === artifactId);
    if (!artifact || artifact.status !== 'AVAILABLE') throw new NotFoundException('Available artifact not found');
    return { artifactId, download: await this.storage.signDownload(artifact.objectKey) };
  }

  private text(value: unknown, field: string): string {
    if (typeof value !== 'string' || !value.trim()) throw new BadRequestException(`${field} must be a non-empty string`);
    return value.trim();
  }

  private enumValue<T extends Record<string, string>>(values: T, value: unknown, field: string): T[keyof T] {
    if (typeof value !== 'string' || !Object.values(values).includes(value)) throw new BadRequestException(`${field} is invalid`);
    return value as T[keyof T];
  }

  private optionalTtl(value: unknown): number | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== 'number') throw new BadRequestException('expiresInSeconds must be a number');
    return value;
  }

  private optionalDate(value: unknown): Date | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== 'string') throw new BadRequestException('expiresAt must be an ISO date-time string');
    const date = new Date(value);
    if (Number.isNaN(date.getTime()) || date <= new Date()) throw new BadRequestException('expiresAt must be a future ISO date-time');
    return date;
  }
}
