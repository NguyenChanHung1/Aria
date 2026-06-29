import type { SongProject } from "@aria/shared-types";

interface Props {
  project: SongProject;
}

export function SongResult({ project }: Props) {
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

  return (
    <div className="result">
      <h2>{project.plan?.title ?? "Your Song"}</h2>
      {project.plan?.summary && <p className="summary">{project.plan.summary}</p>}

      {project.plan && (
        <section>
          <h3>Production plan</h3>
          <div className="meta">
            <span>{project.plan.bpm} BPM</span>
            <span>{project.plan.key}</span>
            <span>{project.plan.instrumentation.join(" · ")}</span>
          </div>
          <ul className="structure">
            {project.plan.structure.map((s) => (
              <li key={s.name}>
                <strong>{s.name}</strong> ({s.bars} bars) — {s.description}
              </li>
            ))}
          </ul>
        </section>
      )}

      {project.lyrics && (
        <section>
          <h3>Lyrics</h3>
          <pre className="lyrics">{project.lyrics.fullText}</pre>
        </section>
      )}

      {project.mix && (
        <section>
          <h3>Final mix</h3>
          <p className="mix-info">
            {project.mix.durationSeconds.toFixed(1)}s · {project.mix.loudnessLufs} LUFS
          </p>
          <p className="path-note">
            Audio saved at: <code>{project.mix.audioPath}</code>
          </p>
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
  h3 {
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted);
    margin-bottom: 0.75rem;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }
  .meta span {
    background: var(--surface-2);
    padding: 0.25rem 0.6rem;
    border-radius: 6px;
    font-size: 0.8rem;
  }
  .structure {
    list-style: none;
    font-size: 0.9rem;
    color: var(--muted);
  }
  .structure li {
    padding: 0.35rem 0;
  }
  .structure strong {
    color: var(--text);
  }
  .lyrics {
    white-space: pre-wrap;
    font-family: inherit;
    font-size: 0.95rem;
    line-height: 1.7;
    background: var(--surface-2);
    padding: 1rem;
    border-radius: 8px;
  }
  .mix-info {
    font-size: 0.9rem;
    color: var(--success);
  }
  .path-note {
    margin-top: 0.5rem;
    font-size: 0.8rem;
    color: var(--muted);
  }
  code {
    font-size: 0.75rem;
    word-break: break-all;
  }
`;
