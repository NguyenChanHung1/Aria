import { Injectable } from '@nestjs/common';
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
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
  abstract putFile(objectKey: string, filePath: string, contentType: string): Promise<void>;
  abstract putBytes(objectKey: string, body: Uint8Array, contentType: string): Promise<void>;
  abstract signInternalDownload(objectKey: string, expiresInSeconds?: number): Promise<SignedObjectUrl>;
  abstract signInternalUpload(objectKey: string, contentType: string, expiresInSeconds?: number): Promise<SignedObjectUrl>;
  abstract checksumAndSize(objectKey: string): Promise<{ checksumSha256: string; fileSize: number }>;
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

  async putFile(objectKey: string, filePath: string, contentType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: config.objectStorage.bucket, Key: objectKey, Body: createReadStream(filePath), ContentType: contentType }));
  }

  async putBytes(objectKey: string, body: Uint8Array, contentType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: config.objectStorage.bucket, Key: objectKey, Body: body, ContentType: contentType }));
  }

  async signInternalDownload(objectKey: string, expiresInSeconds = config.objectStorage.signedUrlTtlSeconds): Promise<SignedObjectUrl> {
    const ttl = this.ttl(expiresInSeconds);
    const url = await getSignedUrl(this.client, new GetObjectCommand({ Bucket: config.objectStorage.bucket, Key: objectKey }), { expiresIn: ttl });
    return { method: 'GET', url, expiresAt: new Date(Date.now() + ttl * 1000).toISOString(), headers: {} };
  }

  async signInternalUpload(objectKey: string, contentType: string, expiresInSeconds = config.objectStorage.signedUrlTtlSeconds): Promise<SignedObjectUrl> {
    const ttl = this.ttl(expiresInSeconds);
    const url = await getSignedUrl(this.client, new PutObjectCommand({ Bucket: config.objectStorage.bucket, Key: objectKey, ContentType: contentType }), { expiresIn: ttl });
    return { method: 'PUT', url, expiresAt: new Date(Date.now() + ttl * 1000).toISOString(), headers: { 'content-type': contentType } };
  }

  async checksumAndSize(objectKey: string): Promise<{ checksumSha256: string; fileSize: number }> {
    const response = await this.client.send(new GetObjectCommand({ Bucket: config.objectStorage.bucket, Key: objectKey }));
    if (!response.Body) throw new Error('Object has no body');
    const hash = createHash('sha256');
    let fileSize = 0;
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) { hash.update(chunk); fileSize += chunk.byteLength; }
    return { checksumSha256: hash.digest('hex'), fileSize };
  }

  private ttl(value: number): number {
    if (!Number.isInteger(value) || value < 60 || value > 3600) throw new Error('Signed URL lifetime must be between 60 and 3600 seconds');
    return value;
  }
}
