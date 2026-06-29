"use client";

import { useCallback, useState } from "react";
import type {
  CreateSongResponse,
  Mood,
  Genre,
  SongBrief,
  SongLength,
  SongProject,
  VocalStyle,
  PipelineStage,
} from "@aria/shared-types";
import { PipelineProgress } from "./PipelineProgress";
import { SongResult } from "./SongResult";

const MOODS: { value: Mood; label: string }[] = [
  { value: "happy", label: "Happy" },
  { value: "sad", label: "Sad" },
  { value: "energetic", label: "Energetic" },
  { value: "chill", label: "Chill" },
  { value: "romantic", label: "Romantic" },
  { value: "epic", label: "Epic" },
  { value: "mysterious", label: "Mysterious" },
];

const GENRES: { value: Genre; label: string }[] = [
  { value: "pop", label: "Pop" },
  { value: "rock", label: "Rock" },
  { value: "hip-hop", label: "Hip-hop" },
  { value: "r-and-b", label: "R&B" },
  { value: "electronic", label: "Electronic" },
  { value: "folk", label: "Folk" },
  { value: "jazz", label: "Jazz" },
  { value: "country", label: "Country" },
];

interface Props {
  agentUrl: string;
}

export function SongCreator({ agentUrl }: Props) {
  const [idea, setIdea] = useState("");
  const [mood, setMood] = useState<Mood>("happy");
  const [genre, setGenre] = useState<Genre>("pop");
  const [length, setLength] = useState<SongLength>("medium");
  const [vocalStyle, setVocalStyle] = useState<VocalStyle>("female");
  const [loading, setLoading] = useState(false);
  const [project, setProject] = useState<SongProject | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pollProject = useCallback(
    async (projectId: string) => {
      const terminal: PipelineStage[] = ["complete", "failed"];
      for (let i = 0; i < 90; i++) {
        const res = await fetch(`${agentUrl}/songs/${projectId}`);
        if (!res.ok) throw new Error("Failed to fetch project status");
        const data = await res.json();
        const p = normalizeProject(data.project);
        setProject(p);
        if (terminal.includes(p.stage)) return;
        await new Promise((r) => setTimeout(r, 2000));
      }
    },
    [agentUrl],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!idea.trim()) return;

    setLoading(true);
    setError(null);
    setProject(null);

    const brief: SongBrief = {
      idea: idea.trim(),
      mood,
      genre,
      length,
      vocalStyle,
      language: "en",
    };

    try {
      const res = await fetch(`${agentUrl}/songs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: null,
          idea: brief.idea,
          mood: brief.mood,
          genre: brief.genre,
          length: brief.length,
          vocal_style: brief.vocalStyle,
          language: brief.language,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to start song creation");
      }

      const data: CreateSongResponse = await res.json();
      await pollProject(data.projectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="creator">
      <form className="brief-form" onSubmit={handleSubmit}>
        <label className="field">
          <span>What&apos;s your song about?</span>
          <textarea
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="e.g. A summer road trip with friends, feeling free and alive..."
            rows={4}
            required
            disabled={loading}
          />
        </label>

        <div className="field-row">
          <label className="field">
            <span>Mood</span>
            <select
              value={mood}
              onChange={(e) => setMood(e.target.value as Mood)}
              disabled={loading}
            >
              {MOODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Genre</span>
            <select
              value={genre}
              onChange={(e) => setGenre(e.target.value as Genre)}
              disabled={loading}
            >
              {GENRES.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="field-row">
          <label className="field">
            <span>Length</span>
            <select
              value={length}
              onChange={(e) => setLength(e.target.value as SongLength)}
              disabled={loading}
            >
              <option value="short">Short (~1 min)</option>
              <option value="medium">Medium (~2 min)</option>
              <option value="long">Long (~3 min)</option>
            </select>
          </label>

          <label className="field">
            <span>Vocals</span>
            <select
              value={vocalStyle}
              onChange={(e) => setVocalStyle(e.target.value as VocalStyle)}
              disabled={loading}
            >
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="duet">Duet</option>
              <option value="instrumental">Instrumental</option>
            </select>
          </label>
        </div>

        <button type="submit" className="submit-btn" disabled={loading || !idea.trim()}>
          {loading ? "Creating your song…" : "Create my song"}
        </button>
      </form>

      {error && <div className="error-banner">{error}</div>}

      {project && (
        <div className="results">
          <PipelineProgress stage={project.stage} />
          <SongResult project={project} />
        </div>
      )}

      <style jsx>{`
        .creator {
          max-width: 720px;
          margin: 0 auto;
          padding: 0 1.5rem 4rem;
        }
        .brief-form {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 1.75rem;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }
        .field {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }
        .field span {
          font-size: 0.85rem;
          color: var(--muted);
          font-weight: 500;
        }
        .field textarea,
        .field select {
          background: var(--surface-2);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 0.75rem 1rem;
          color: var(--text);
          font-size: 1rem;
        }
        .field textarea:focus,
        .field select:focus {
          outline: 2px solid var(--accent);
          border-color: transparent;
        }
        .field-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }
        @media (max-width: 520px) {
          .field-row {
            grid-template-columns: 1fr;
          }
        }
        .submit-btn {
          margin-top: 0.5rem;
          padding: 0.9rem 1.5rem;
          border: none;
          border-radius: 8px;
          font-size: 1rem;
          font-weight: 600;
          color: white;
          background: linear-gradient(135deg, var(--accent), var(--accent-2));
        }
        .submit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .error-banner {
          margin-top: 1rem;
          padding: 1rem;
          background: rgba(248, 113, 113, 0.15);
          border: 1px solid var(--error);
          border-radius: 8px;
          color: var(--error);
        }
        .results {
          margin-top: 2rem;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
      `}</style>
    </div>
  );
}

/** Map snake_case API responses to camelCase shared types. */
function normalizeProject(raw: Record<string, unknown>): SongProject {
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
    plan: raw.plan
      ? {
          title: (raw.plan as Record<string, unknown>).title as string,
          summary: (raw.plan as Record<string, unknown>).summary as string,
          bpm: (raw.plan as Record<string, unknown>).bpm as number,
          key: (raw.plan as Record<string, unknown>).key as string,
          structure: (
            (raw.plan as Record<string, unknown>).structure as Array<
              Record<string, unknown>
            >
          ).map((s) => ({
            name: s.name as string,
            bars: s.bars as number,
            description: s.description as string,
          })),
          instrumentation: (raw.plan as Record<string, unknown>)
            .instrumentation as string[],
          productionNotes: ((raw.plan as Record<string, unknown>)
            .production_notes ??
            (raw.plan as Record<string, unknown>).productionNotes) as string[],
        }
      : undefined,
    lyrics: raw.lyrics
      ? {
          fullText: ((raw.lyrics as Record<string, unknown>).full_text ??
            (raw.lyrics as Record<string, unknown>).fullText) as string,
          sections: (raw.lyrics as Record<string, unknown>).sections as Record<
            string,
            string
          >,
        }
      : undefined,
    composition: raw.composition
      ? {
          midiPath: ((raw.composition as Record<string, unknown>).midi_path ??
            (raw.composition as Record<string, unknown>).midiPath) as string,
          stemPaths: ((raw.composition as Record<string, unknown>).stem_paths ??
            (raw.composition as Record<string, unknown>).stemPaths) as string[],
          durationSeconds: ((raw.composition as Record<string, unknown>)
            .duration_seconds ??
            (raw.composition as Record<string, unknown>).durationSeconds) as number,
        }
      : undefined,
    mix: raw.mix
      ? {
          audioPath: ((raw.mix as Record<string, unknown>).audio_path ??
            (raw.mix as Record<string, unknown>).audioPath) as string,
          format: (raw.mix as Record<string, unknown>).format as "wav" | "mp3",
          durationSeconds: ((raw.mix as Record<string, unknown>).duration_seconds ??
            (raw.mix as Record<string, unknown>).durationSeconds) as number,
          loudnessLufs: ((raw.mix as Record<string, unknown>).loudness_lufs ??
            (raw.mix as Record<string, unknown>).loudnessLufs) as number,
        }
      : undefined,
    error: raw.error as string | undefined,
    createdAt: (raw.created_at ?? raw.createdAt) as string,
    updatedAt: (raw.updated_at ?? raw.updatedAt) as string,
  };
}
