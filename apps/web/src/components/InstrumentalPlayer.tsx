import { assetUrl } from "@/lib/agent";
import type { SongProject } from "@aria/shared-types";

interface Props {
  agentUrl: string;
  project: SongProject;
}

export function InstrumentalPlayer({ agentUrl, project }: Props) {
  if (!project.composition) return null;

  const src = assetUrl(agentUrl, project.id, "instrumental");
  const mixing = project.stage === "mixing";

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Instrumental preview</h2>
        {mixing ? (
          <span className="badge mixing">Mixing in progress…</span>
        ) : (
          <span className="badge">Preview ready</span>
        )}
      </div>

      <p className="hint">
        Listen while Aria finishes the final mix. This is the MIDI-based arrangement
        before mastering.
      </p>

      <audio controls src={src} className="player" preload="metadata">
        Your browser does not support audio playback.
      </audio>

      <div className="meta">
        <span>{project.composition.durationSeconds.toFixed(1)}s</span>
        {project.plan && (
          <>
            <span>{project.plan.bpm} BPM</span>
            <span>{project.plan.key}</span>
          </>
        )}
        <a href={assetUrl(agentUrl, project.id, "midi")} className="midi-link" download>
          Download MIDI
        </a>
      </div>

      <style jsx>{`
        .panel {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 1.5rem;
        }
        .panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 0.75rem;
        }
        h2 {
          font-size: 1.1rem;
        }
        .badge {
          font-size: 0.7rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--success);
          background: rgba(52, 211, 153, 0.15);
          padding: 0.3rem 0.6rem;
          border-radius: 999px;
          white-space: nowrap;
        }
        .badge.mixing {
          color: #fbbf24;
          background: rgba(251, 191, 36, 0.15);
          animation: pulse 2s ease-in-out infinite;
        }
        @keyframes pulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.6;
          }
        }
        .hint {
          color: var(--muted);
          font-size: 0.9rem;
          margin-bottom: 1rem;
        }
        .player {
          width: 100%;
          margin-bottom: 0.75rem;
        }
        .meta {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          align-items: center;
          font-size: 0.8rem;
        }
        .meta span {
          background: var(--surface-2);
          padding: 0.25rem 0.6rem;
          border-radius: 6px;
        }
        .midi-link {
          color: var(--accent);
          text-decoration: none;
          margin-left: auto;
        }
        .midi-link:hover {
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
}
