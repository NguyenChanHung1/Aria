import { BadRequestException, Injectable } from '@nestjs/common';

const choices = {
  moods: new Set(['happy', 'sad', 'energetic', 'chill', 'romantic', 'epic', 'mysterious']),
  genres: new Set(['pop', 'rock', 'hip-hop', 'r-and-b', 'electronic', 'folk', 'jazz', 'country']),
  lengths: new Set(['short', 'medium', 'long']),
  vocals: new Set(['male', 'female', 'duet', 'instrumental']),
};

@Injectable()
export class SongBriefService {
  create(body: Record<string, unknown>, hasMedia: boolean): Record<string, string | null> {
    const idea = (this.text(body.idea ?? body.prompt, 'idea or prompt') ?? '').trim() || (hasMedia ? 'Create a song inspired by the uploaded audio.' : '');
    if (idea.length < 3) throw new BadRequestException('idea or prompt must contain at least 3 characters');
    if (idea.length > 10_000) throw new BadRequestException('idea or prompt must contain 10000 characters or fewer');
    const sourceLyrics = (this.text(body.lyrics, 'lyrics') ?? '').trim();
    if (sourceLyrics.length > 50_000) throw new BadRequestException('lyrics must contain 50000 characters or fewer');
    const title = this.text(body.title, 'title');
    const language = this.text(body.language, 'language') ?? 'en';
    if (title && title.length > 200) throw new BadRequestException('title must contain 200 characters or fewer');
    if (language.length > 35) throw new BadRequestException('language must contain 35 characters or fewer');
    return {
      title: title || null,
      idea,
      mood: this.pick(this.text(body.mood, 'mood'), choices.moods, 'happy'),
      genre: this.pick(this.text(body.genre, 'genre'), choices.genres, 'pop'),
      length: this.pick(this.text(body.length, 'length'), choices.lengths, 'medium'),
      vocal_style: this.pick(this.text(body.vocal_style ?? body.vocalStyle, 'vocal_style'), choices.vocals, 'female'),
      language,
      ...(sourceLyrics ? { source_lyrics: sourceLyrics } : {}),
    };
  }

  private text(value: unknown, field: string): string | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'string') throw new BadRequestException(`${field} must be a string`);
    return value;
  }

  private pick(value: string | undefined, allowed: Set<string>, fallback: string): string {
    if (!value) return fallback;
    if (!allowed.has(value)) throw new BadRequestException(`Unsupported value: ${value}`);
    return value;
  }
}
