"use client";

import { useState } from "react";
import type { Genre, Mood, SongBrief, SongLength, VocalStyle } from "@aria/shared-types";
import { createSong } from "@/lib/agent";
import { useProjectEvents } from "@/hooks/useProjectEvents";
import { PipelineProgress } from "./PipelineProgress";
import { LyricsPanel } from "./LyricsPanel";
import { InstrumentalPlayer } from "./InstrumentalPlayer";
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
  const [projectId, setProjectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { project, connectionError } = useProjectEvents({
    agentUrl,
    projectId,
    enabled: !!projectId,
  });

  const showLyrics =
    project?.lyrics &&
    ["composition", "mixing", "complete"].includes(project.stage);

  const showInstrumental =
    project?.composition &&
    ["mixing", "complete"].includes(project.stage);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!idea.trim()) return;

    setLoading(true);
    setError(null);
    setProjectId(null);

    const brief: SongBrief = {
      idea: idea.trim(),
      mood,
      genre,
      length,
      vocalStyle,
      language: "en",
    };

    try {
      const data = await createSong(agentUrl, brief);
      setProjectId(data.projectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const isActive = loading || (project && !["complete", "failed"].includes(project.stage));

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
            disabled={!!isActive}
          />
        </label>

        <div className="field-row">
          <label className="field">
            <span>Mood</span>
            <select
              value={mood}
              onChange={(e) => setMood(e.target.value as Mood)}
              disabled={!!isActive}
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
              disabled={!!isActive}
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
              disabled={!!isActive}
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
              disabled={!!isActive}
            >
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="duet">Duet</option>
              <option value="instrumental">Instrumental</option>
            </select>
          </label>
        </div>

        <button type="submit" className="submit-btn" disabled={!!isActive || !idea.trim()}>
          {isActive ? "Creating your song…" : "Create my song"}
        </button>
      </form>

      {error && <div className="error-banner">{error}</div>}
      {connectionError && project && !["complete", "failed"].includes(project.stage) && (
        <div className="warn-banner">{connectionError}</div>
      )}

      {project && (
        <div className="results">
          <PipelineProgress stage={project.stage} />
          {showLyrics && <LyricsPanel project={project} />}
          {showInstrumental && <InstrumentalPlayer agentUrl={agentUrl} project={project} />}
          <SongResult agentUrl={agentUrl} project={project} />
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
        .warn-banner {
          margin-top: 1rem;
          padding: 0.75rem 1rem;
          background: rgba(251, 191, 36, 0.12);
          border: 1px solid #fbbf24;
          border-radius: 8px;
          color: #fbbf24;
          font-size: 0.9rem;
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
