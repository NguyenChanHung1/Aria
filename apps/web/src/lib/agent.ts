import type {
  CreateSongResponse,
  Genre,
  Mood,
  PipelineStage,
  SongBrief,
  SongLength,
  SongProject,
  VocalStyle,
} from "@aria/shared-types";

export type AssetKind = "instrumental" | "mix" | "midi";

export function assetUrl(agentUrl: string, projectId: string, asset: AssetKind): string {
  return `${agentUrl}/songs/${projectId}/assets/${asset}`;
}

export async function createSong(
  agentUrl: string,
  brief: SongBrief,
): Promise<CreateSongResponse> {
  const res = await fetch(`${agentUrl}/songs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: brief.title ?? null,
      idea: brief.idea,
      mood: brief.mood,
      genre: brief.genre,
      length: brief.length,
      vocal_style: brief.vocalStyle,
      language: brief.language ?? "en",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to start song creation");
  }

  const data = await res.json();
  return { projectId: data.project_id, stage: data.stage };
}

export function subscribeToProject(
  agentUrl: string,
  projectId: string,
  onUpdate: (project: SongProject) => void,
  onError?: (error: Error) => void,
): () => void {
  const source = new EventSource(`${agentUrl}/songs/${projectId}/events`);

  source.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data) as { project: Record<string, unknown> };
      onUpdate(normalizeProject(payload.project));
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error("Failed to parse project event"));
    }
  };

  source.onerror = () => {
    onError?.(new Error("Lost connection to agent — retrying…"));
  };

  return () => source.close();
}

/** Map snake_case API responses to camelCase shared types. */
export function normalizeProject(raw: Record<string, unknown>): SongProject {
  const brief = raw.brief as Record<string, unknown>;
  return {
    id: raw.id as string,
    brief: {
      title: brief.title as string | undefined,
      idea: brief.idea as string,
      mood: brief.mood as Mood,
      genre: brief.genre as Genre,
      length: brief.length as SongLength,
      vocalStyle: (brief.vocal_style ?? brief.vocalStyle) as VocalStyle,
      language: (brief.language as string) ?? "en",
    },
    stage: raw.stage as PipelineStage,
    plan: raw.plan ? normalizePlan(raw.plan as Record<string, unknown>) : undefined,
    lyrics: raw.lyrics ? normalizeLyrics(raw.lyrics as Record<string, unknown>) : undefined,
    composition: raw.composition
      ? normalizeComposition(raw.composition as Record<string, unknown>)
      : undefined,
    mix: raw.mix ? normalizeMix(raw.mix as Record<string, unknown>) : undefined,
    error: raw.error as string | undefined,
    createdAt: (raw.created_at ?? raw.createdAt) as string,
    updatedAt: (raw.updated_at ?? raw.updatedAt) as string,
  };
}

function normalizePlan(raw: Record<string, unknown>) {
  return {
    title: raw.title as string,
    summary: raw.summary as string,
    bpm: raw.bpm as number,
    key: raw.key as string,
    structure: (raw.structure as Array<Record<string, unknown>>).map((s) => ({
      name: s.name as string,
      bars: s.bars as number,
      description: s.description as string,
    })),
    instrumentation: raw.instrumentation as string[],
    productionNotes: (raw.production_notes ?? raw.productionNotes) as string[],
  };
}

function normalizeLyrics(raw: Record<string, unknown>) {
  return {
    fullText: (raw.full_text ?? raw.fullText) as string,
    sections: raw.sections as Record<string, string>,
  };
}

function normalizeComposition(raw: Record<string, unknown>) {
  return {
    midiPath: (raw.midi_path ?? raw.midiPath) as string,
    stemPaths: (raw.stem_paths ?? raw.stemPaths) as string[],
    instrumentalPreviewPath: (raw.instrumental_preview_path ??
      raw.instrumentalPreviewPath) as string,
    durationSeconds: (raw.duration_seconds ?? raw.durationSeconds) as number,
  };
}

function normalizeMix(raw: Record<string, unknown>) {
  return {
    audioPath: (raw.audio_path ?? raw.audioPath) as string,
    format: raw.format as "wav" | "mp3",
    durationSeconds: (raw.duration_seconds ?? raw.durationSeconds) as number,
    loudnessLufs: (raw.loudness_lufs ?? raw.loudnessLufs) as number,
  };
}
