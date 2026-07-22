import { Injectable } from '@nestjs/common';
import { InvalidationService } from './invalidation.service';

@Injectable()
export class LineageService {
  constructor(private readonly invalidation: InvalidationService) {}

  summarize(projectId: string, artifactId: string) {
    return this.invalidation.lineage(projectId, artifactId);
  }
}
