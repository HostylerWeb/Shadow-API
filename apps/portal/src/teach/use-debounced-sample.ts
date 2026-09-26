import { useEffect, useRef, useState, type RefObject } from "react";
import { isCompositeExtract } from "@shadowapi/teach-extract";
import { requestSample } from "./iframe-bridge";
import type { MarkedExtract } from "./protocol";

const MAX_TRIES = 6;

function payloadStillEmpty(object: Record<string, unknown>): boolean {
  const values = Object.values(object);
  if (!values.length) return true;
  return values.every((value) => value === "" || (Array.isArray(value) && value.length === 0));
}

export function useDebouncedSample(
  frame: RefObject<HTMLIFrameElement | null>,
  spec: MarkedExtract | null,
  enabled: boolean,
  delayMs = 300,
): {
  rows: Record<string, string>[];
  previewPayload: Record<string, unknown> | null;
  error: string;
  loading: boolean;
  refresh: () => void;
} {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [previewPayload, setPreviewPayload] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const specKey = spec ? JSON.stringify(spec) : "";
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);
  const specRef = useRef(spec);
  specRef.current = spec;

  const run = (retry = 0) => {
    const current = specRef.current;
    if (!enabled || !current || !frame.current) {
      setRows([]);
      setPreviewPayload(null);
      setError("");
      setLoading(false);
      return;
    }
    const gen = generation.current;
    setLoading(true);
    setError("");
    void requestSample(frame.current, current)
      .then((result) => {
        if (gen !== generation.current) return;
        if (isCompositeExtract(current)) {
          const object = (result[0] ?? {}) as Record<string, unknown>;
          if (payloadStillEmpty(object) && retry < MAX_TRIES) {
            timerRef.current = setTimeout(() => run(retry + 1), 1200);
            return;
          }
          setPreviewPayload(object);
          setRows([]);
          setLoading(false);
          if (payloadStillEmpty(object)) setError("No data matched your marks on this page.");
          return;
        }
        if (!result.length && retry < MAX_TRIES) {
          timerRef.current = setTimeout(() => run(retry + 1), 1200);
          return;
        }
        setPreviewPayload(null);
        setRows(result);
        setLoading(false);
        if (!result.length) setError("No data matched your marks on this page.");
      })
      .catch((err) => {
        if (gen !== generation.current) return;
        if (retry < MAX_TRIES) {
          timerRef.current = setTimeout(() => run(retry + 1), 1200);
          return;
        }
        setLoading(false);
        setError(err instanceof Error ? err.message : "Could not read marked fields");
      });
  };

  const refresh = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    generation.current += 1;
    run(0);
  };

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!enabled || !spec) {
      generation.current += 1;
      setRows([]);
      setPreviewPayload(null);
      setError("");
      setLoading(false);
      return;
    }
    generation.current += 1;
    timerRef.current = setTimeout(() => run(0), delayMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- specKey tracks spec
  }, [specKey, enabled, delayMs]);

  return { rows, previewPayload, error, loading, refresh };
}
