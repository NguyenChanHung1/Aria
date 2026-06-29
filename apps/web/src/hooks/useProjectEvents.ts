"use client";

import { useEffect, useState } from "react";
import type { SongProject } from "@aria/shared-types";
import { normalizeProject, subscribeToProject } from "@/lib/agent";

interface Options {
  agentUrl: string;
  projectId: string | null;
  enabled?: boolean;
}

export function useProjectEvents({ agentUrl, projectId, enabled = true }: Options) {
  const [project, setProject] = useState<SongProject | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !projectId) {
      setProject(null);
      setConnectionError(null);
      return;
    }

    setConnectionError(null);

    const unsubscribe = subscribeToProject(
      agentUrl,
      projectId,
      (updated) => {
        setProject(updated);
        setConnectionError(null);
      },
      (err) => setConnectionError(err.message),
    );

    return unsubscribe;
  }, [agentUrl, projectId, enabled]);

  return { project, connectionError };
}

export { normalizeProject };
