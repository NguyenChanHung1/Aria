import { Injectable } from '@nestjs/common';
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config';
import type { ArtifactNamespace } from './artifact.contracts';

export interface SignedObjectUrl {
  method: 'GET' | 'PUT';
  url: string;
  expiresAt: string;
  headers: Record<string, string>;
}

export abstract class ObjectStorage {
  abstract signUpload(objectKey: string, contentType: string, expiresInSeconds?: number): Promise<SignedObjectUrl>;
  abstract signDownload(objectKey: string, expiresInSeconds?: number): Promise<SignedObjectUrl>;
  abstract exists(objectKey: string): Promise<boolean>;
}

function safeSegment(value: string, label: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) throw new Error(`Invalid ${label}`);
  return value;
}

export function artifactObjectKey(input: {
  projectId: string;
  namespace: ArtifactNamespace;
  artifactId: string;
  fileName: string;
}): string {
  return [
    'projects',
    safeSegment(input.projectId, 'project ID'),
    input.namespace,
    safeSegment(input.artifactId, 'artifact ID'),
    safeSegment(input.fileName, 'file name'),
  ].join('/');
}

@Injectable()
export class S3ObjectStorage implements ObjectStorage {
  private readonly client = new S3Client({
    region: config.objectStorage.region,
    endpoint: config.objectStorage.endpoint,
    forcePathStyle: config.objectStorage.forcePathStyle,
    credentials: {
      accessKeyId: config.objectStorage.accessKey,
      secretAccessKey: config.objectStorage.secretKey,
    },
  });
  private readonly signingClient = new S3Client({
    region: config.objectStorage.region,
    endpoint: config.objectStorage.publicEndpoint,
    forcePathStyle: config.objectStorage.forcePathStyle,
    credentials: {
      accessKeyId: config.objectStorage.accessKey,
      secretAccessKey: config.objectStorage.secretKey,
    },
  });

  async signUpload(objectKey: string, contentType: string, expiresInSeconds = config.objectStorage.signedUrlTtlSeconds): Promise<SignedObjectUrl> {
    const ttl = this.ttl(expiresInSeconds);
    const url = await getSignedUrl(this.signingClient, new PutObjectCommand({ Bucket: config.objectStorage.bucket, Key: objectKey, ContentType: contentType }), { expiresIn: ttl });
    return { method: 'PUT', url, expiresAt: new Date(Date.now() + ttl * 1000).toISOString(), headers: { 'content-type': contentType } };
  }

  async signDownload(objectKey: string, expiresInSeconds = config.objectStorage.signedUrlTtlSeconds): Promise<SignedObjectUrl> {
    const ttl = this.ttl(expiresInSeconds);
    const url = await getSignedUrl(this.signingClient, new GetObjectCommand({ Bucket: config.objectStorage.bucket, Key: objectKey }), { expiresIn: ttl });
    return { method: 'GET', url, expiresAt: new Date(Date.now() + ttl * 1000).toISOString(), headers: {} };
  }

  async exists(objectKey: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: config.objectStorage.bucket, Key: objectKey }));
      return true;
    } catch (error) {
      const status = typeof error === 'object' && error !== null && '$metadata' in error ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode : undefined;
      if (status === 404) return false;
      throw error;
    }
  }

  private ttl(value: number): number {
    if (!Number.isInteger(value) || value < 60 || value > 3600) throw new Error('Signed URL lifetime must be between 60 and 3600 seconds');
    return value;
  }
}
