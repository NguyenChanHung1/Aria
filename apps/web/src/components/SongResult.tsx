import { assetUrl } from "@/lib/agent";
import type { SongProject } from "@aria/shared-types";

interface Props {
  agentUrl: string;
  project: SongProject;
}

export function SongResult({ agentUrl, project }: Props) {
  if (project.stage === "failed") {
    return (
      <div className="result error">
        <p>{project.error ?? "An unknown error occurred."}</p>
        <style jsx>{resultStyles}</style>
      </div>
    );
  }

  if (project.stage !== "complete") {
    return null;
  }

  const mixSrc = project.mix ? assetUrl(agentUrl, project.id, "mix") : undefined;

  return (
    <div className="result">
      <h2>{project.plan?.title ?? "Your Song"}</h2>
      {project.plan?.summary && <p className="summary">{project.plan.summary}</p>}

      {mixSrc && (
        <section>
          <h3>Final mix</h3>
          <audio controls src={mixSrc} className="player" preload="metadata" />
          {project.mix && (
            <p className="mix-info">
              {project.mix.durationSeconds.toFixed(1)}s · {project.mix.loudnessLufs} LUFS
            </p>
          )}
        </section>
      )}

      {project.plan && (
        <section>
          <h3>Production plan</h3>
          <div className="meta">
            <span>{project.plan.bpm} BPM</span>
            <span>{project.plan.key}</span>
            <span>{project.plan.instrumentation.join(" · ")}</span>
          </div>
        </section>
      )}

      <style jsx>{resultStyles}</style>
    </div>
  );
}

const resultStyles = `
  .result {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1.75rem;
  }
  .result.error {
    border-color: var(--error);
    color: var(--error);
  }
  h2 {
    font-size: 1.5rem;
    margin-bottom: 0.5rem;
  }
  .summary {
    color: var(--muted);
    margin-bottom: 1.5rem;
  }
  section {
    margin-top: 1.5rem;
    padding-top: 1.5rem;
    border-top: 1px solid var(--border);
  }
  section:first-of-type {
    margin-top: 0;
    padding-top: 0;
    border-top: none;
  }
  h3 {
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted);
    margin-bottom: 0.75rem;
  }
  .player {
    width: 100%;
    margin-bottom: 0.5rem;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .meta span {
    background: var(--surface-2);
    padding: 0.25rem 0.6rem;
    border-radius: 6px;
    font-size: 0.8rem;
  }
  .mix-info {
    font-size: 0.9rem;
    color: var(--success);
  }
`;
