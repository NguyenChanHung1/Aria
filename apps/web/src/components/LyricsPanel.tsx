import type { SongProject } from "@aria/shared-types";

interface Props {
  project: SongProject;
}

export function LyricsPanel({ project }: Props) {
  if (!project.lyrics) return null;

  const sections = Object.entries(project.lyrics.sections);

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Your lyrics</h2>
        <span className="badge">Ready for composition</span>
      </div>
      {project.plan?.title && <p className="title">{project.plan.title}</p>}

      <div className="sections">
        {sections.map(([name, text]) => (
          <article key={name} className="section">
            <h3>{name}</h3>
            <p>{text}</p>
          </article>
        ))}
      </div>

      <details className="full-text">
        <summary>Full lyrics</summary>
        <pre>{project.lyrics.fullText}</pre>
      </details>

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
          margin-bottom: 1rem;
        }
        h2 {
          font-size: 1.1rem;
        }
        .badge {
          font-size: 0.7rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--accent);
          background: rgba(168, 85, 247, 0.15);
          padding: 0.3rem 0.6rem;
          border-radius: 999px;
          white-space: nowrap;
        }
        .title {
          color: var(--muted);
          margin-bottom: 1rem;
          font-size: 0.95rem;
        }
        .sections {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .section h3 {
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--accent-2);
          margin-bottom: 0.35rem;
        }
        .section p {
          white-space: pre-wrap;
          line-height: 1.65;
          font-size: 0.95rem;
        }
        .full-text {
          margin-top: 1.25rem;
          font-size: 0.85rem;
          color: var(--muted);
        }
        .full-text pre {
          margin-top: 0.5rem;
          white-space: pre-wrap;
          font-family: inherit;
          background: var(--surface-2);
          padding: 1rem;
          border-radius: 8px;
          color: var(--text);
        }
      `}</style>
    </div>
  );
}
