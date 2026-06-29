import type { PipelineStage } from "@aria/shared-types";

const STAGES: { key: PipelineStage; label: string; description: string }[] = [
  { key: "planning", label: "Plan", description: "Structuring your song" },
  { key: "lyrics", label: "Lyrics", description: "Writing the words" },
  { key: "composition", label: "Compose", description: "Creating the music" },
  { key: "mixing", label: "Mix", description: "Balancing the final track" },
  { key: "complete", label: "Done", description: "Your song is ready" },
];

const ORDER: PipelineStage[] = [
  "planning",
  "lyrics",
  "composition",
  "mixing",
  "complete",
];

interface Props {
  stage: PipelineStage;
}

export function PipelineProgress({ stage }: Props) {
  const currentIndex =
    stage === "failed"
      ? -1
      : ORDER.indexOf(stage === "complete" ? "complete" : stage);

  return (
    <div className="pipeline">
      <h2>Progress</h2>
      {stage === "failed" ? (
        <p className="failed">Something went wrong. Please try again.</p>
      ) : (
        <ol className="steps">
          {STAGES.map((s, i) => {
            const done = currentIndex > i || stage === "complete";
            const active = ORDER[i] === stage && stage !== "complete";
            return (
              <li
                key={s.key}
                className={[done ? "done" : "", active ? "active" : ""]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span className="dot" />
                <div>
                  <strong>{s.label}</strong>
                  <span>{s.description}</span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <style jsx>{`
        .pipeline {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 1.5rem;
        }
        h2 {
          font-size: 1rem;
          margin-bottom: 1rem;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .failed {
          color: var(--error);
        }
        .steps {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .steps li {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          opacity: 0.45;
        }
        .steps li.done,
        .steps li.active {
          opacity: 1;
        }
        .dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: var(--border);
          margin-top: 0.35rem;
          flex-shrink: 0;
        }
        .steps li.done .dot {
          background: var(--success);
        }
        .steps li.active .dot {
          background: var(--accent);
          box-shadow: 0 0 8px var(--accent);
        }
        .steps strong {
          display: block;
          font-size: 0.95rem;
        }
        .steps span {
          font-size: 0.8rem;
          color: var(--muted);
        }
      `}</style>
    </div>
  );
}
