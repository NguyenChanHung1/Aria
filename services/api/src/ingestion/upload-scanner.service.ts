import { Injectable } from '@nestjs/common';

export abstract class UploadScanner {
  abstract scan(filePath: string, signal?: AbortSignal): Promise<void>;
}

@Injectable()
export class NoopUploadScanner implements UploadScanner {
  async scan(_filePath: string, _signal?: AbortSignal): Promise<void> {
    // Replace this provider with a malware/content scanner in production.
  }
}
