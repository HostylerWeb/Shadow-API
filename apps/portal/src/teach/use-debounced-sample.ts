import { useEffect, useRef, useState, type RefObject } from "react";
import { requestSample } from "./iframe-bridge";
import type { MarkedExtract } from "./protocol";

export function useDebouncedSample(
  frame: RefObject<HTMLIFrameElement | null>,
  spec: MarkedExtract | null,
  enabled: boolean,
  delayMs = 300,
): {
  rows: Record<string, string>[];
  error: string;
  loading: boolean;
  refresh: () => void;
} {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const specKey = spec ? JSON.stringify(spec) : "";
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = () => {
    if (!enabled || !spec || !frame.current) {
      setRows([]);
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    void requestSample(frame.current, spec)
      .then((result) => {
        setRows(result);
        if (!result.length) setError("No data matched your marks on this page.");
      })
      .catch((err) => {
        setRows([]);
        setError(err instanceof Error ? err.message : "Could not read marked fields");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!enabled || !spec) {
      setRows([]);
      setError("");
      return;
    }
    timerRef.current = setTimeout(run, delayMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- specKey tracks spec
  }, [specKey, enabled, delayMs]);

  return { rows, error, loading, refresh: run };
}
