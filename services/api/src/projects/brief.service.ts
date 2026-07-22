import { BadRequestException, Injectable } from '@nestjs/common';

export const BRIEF_SCHEMA_VERSION = '1.1.0' as const;

const choices = {
  moods: new Set(['happy', 'sad', 'energetic', 'chill', 'romantic', 'epic', 'mysterious']),
  genres: new Set(['pop', 'rock', 'hip-hop', 'r-and-b', 'electronic', 'folk', 'jazz', 'country']),
  lengths: new Set(['short', 'medium', 'long']),
  vocals: new Set(['male', 'female', 'duet', 'instrumental']),
};

export type ProjectBrief = {
  briefSchemaVersion: typeof BRIEF_SCHEMA_VERSION;
  title: string | null;
  idea: string;
  mood: string;
  genre: string;
  length: string;
  vocal_style: string;
  language: string;
  audience: string | null;
  deliverables: string[];
  source_lyrics?: string;
};

@Injectable()
export class BriefService {
  create(body: Record<string, unknown>, hasMedia: boolean): ProjectBrief {
    const idea = (this.text(body.idea ?? body.prompt, 'idea or prompt') ?? '').trim() || (hasMedia ? 'Create a song inspired by the uploaded audio.' : '');
    if (idea.length < 3) throw new BadRequestException({ code: 'INVALID_BRIEF', message: 'idea or prompt must contain at least 3 characters' });
    if (idea.length > 10_000) throw new BadRequestException({ code: 'INVALID_BRIEF', message: 'idea or prompt must contain 10000 characters or fewer' });
    const sourceLyrics = (this.text(body.lyrics, 'lyrics') ?? '').trim();
    if (sourceLyrics.length > 50_000) throw new BadRequestException({ code: 'INVALID_BRIEF', message: 'lyrics must contain 50000 characters or fewer' });
    const title = this.text(body.title, 'title');
    const language = this.text(body.language, 'language') ?? 'en';
    const audience = this.text(body.audience, 'audience') ?? null;
    if (title && title.length > 200) throw new BadRequestException({ code: 'INVALID_BRIEF', message: 'title must contain 200 characters or fewer' });
    if (language.length > 35) throw new BadRequestException({ code: 'INVALID_BRIEF', message: 'language must contain 35 characters or fewer' });
    if (audience && audience.length > 500) throw new BadRequestException({ code: 'INVALID_BRIEF', message: 'audience must contain 500 characters or fewer' });
    return {
      briefSchemaVersion: BRIEF_SCHEMA_VERSION,
      title: title || null,
      idea,
      mood: this.pick(this.text(body.mood, 'mood'), choices.moods, 'happy'),
      genre: this.pick(this.text(body.genre, 'genre'), choices.genres, 'pop'),
      length: this.pick(this.text(body.length, 'length'), choices.lengths, 'medium'),
      vocal_style: this.pick(this.text(body.vocal_style ?? body.vocalStyle, 'vocal_style'), choices.vocals, 'female'),
      language,
      audience,
      deliverables: this.deliverables(body.deliverables),
      ...(sourceLyrics ? { source_lyrics: sourceLyrics } : {}),
    };
  }

  private deliverables(value: unknown): string[] {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) throw new BadRequestException({ code: 'INVALID_BRIEF', message: 'deliverables must be an array of strings' });
    if (value.length > 10) throw new BadRequestException({ code: 'INVALID_BRIEF', message: 'deliverables may contain at most 10 items' });
    return value.map((item, index) => {
      if (typeof item !== 'string' || !item.trim()) throw new BadRequestException({ code: 'INVALID_BRIEF', message: `deliverables[${index}] must be a non-empty string` });
      const trimmed = item.trim();
      if (trimmed.length > 100) throw new BadRequestException({ code: 'INVALID_BRIEF', message: `deliverables[${index}] must contain 100 characters or fewer` });
      return trimmed;
    });
  }

  private text(value: unknown, field: string): string | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'string') throw new BadRequestException({ code: 'INVALID_BRIEF', message: `${field} must be a string` });
    return value;
  }

  private pick(value: string | undefined, allowed: Set<string>, fallback: string): string {
    if (!value) return fallback;
    if (!allowed.has(value)) throw new BadRequestException({ code: 'UNSUPPORTED_BRIEF_VALUE', message: `Unsupported value: ${value}` });
    return value;
  }
}
