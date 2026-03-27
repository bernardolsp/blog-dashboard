"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Post } from "@/lib/types";
import {
  buildDraftKey,
  deleteDraft,
  getDraft,
  saveDraft,
  type DraftRecord,
} from "@/lib/draft-storage";

type DraftStatus = "idle" | "saving" | "saved" | "restored" | "error";

interface UsePostDraftOptions {
  owner: string;
  repo: string;
  postKey: string;
  post: Post | null;
  enabled?: boolean;
  sourceUpdatedAt?: string;
  onRestore?: (draftPost: Post) => void;
}

export function usePostDraft({
  owner,
  repo,
  postKey,
  post,
  enabled = true,
  sourceUpdatedAt,
  onRestore,
}: UsePostDraftOptions) {
  const [status, setStatus] = useState<DraftStatus>("idle");
  const [hasDraft, setHasDraft] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const hydratedRef = useRef(false);
  const skipNextSaveRef = useRef(false);

  const draftId = useMemo(() => buildDraftKey(owner, repo, postKey), [owner, repo, postKey]);

  useEffect(() => {
    hydratedRef.current = false;
    skipNextSaveRef.current = false;
    setStatus("idle");
    setHasDraft(false);
    setDraftSavedAt(null);
  }, [draftId]);

  useEffect(() => {
    if (!enabled || !post) {
      return;
    }

    let cancelled = false;

    void getDraft(owner, repo, postKey)
      .then((draft) => {
        if (cancelled) {
          return;
        }

        hydratedRef.current = true;

        if (!draft) {
          return;
        }

        setHasDraft(true);
        setDraftSavedAt(draft.savedAt);

        const shouldRestore = !sourceUpdatedAt || !draft.sourceUpdatedAt || draft.savedAt >= sourceUpdatedAt;

        if (shouldRestore) {
          skipNextSaveRef.current = true;
          onRestore?.(draft.post);
          setStatus("restored");
        }
      })
      .catch(() => {
        if (!cancelled) {
          hydratedRef.current = true;
          setStatus("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, onRestore, owner, post, postKey, repo, sourceUpdatedAt]);

  useEffect(() => {
    if (!enabled || !post || !hydratedRef.current) {
      return;
    }

    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }

    const timer = window.setTimeout(() => {
      const record: DraftRecord = {
        id: draftId,
        owner,
        repo,
        postKey,
        sourceUpdatedAt,
        savedAt: new Date().toISOString(),
        post,
      };

      setStatus("saving");

      void saveDraft(record)
        .then(() => {
          setHasDraft(true);
          setDraftSavedAt(record.savedAt);
          setStatus("saved");
        })
        .catch(() => {
          setStatus("error");
        });
    }, 800);

    return () => window.clearTimeout(timer);
  }, [draftId, enabled, owner, post, postKey, repo, sourceUpdatedAt]);

  const clearDraft = useCallback(async () => {
    await deleteDraft(owner, repo, postKey);
    setHasDraft(false);
    setDraftSavedAt(null);
    setStatus("idle");
  }, [owner, postKey, repo]);

  return {
    clearDraft,
    draftSavedAt,
    hasDraft,
    status,
  };
}
