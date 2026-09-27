"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  startUrl: string;
  onEval?: (expr: string) => Promise<unknown>;
};

export function StudioCamoufox({ startUrl }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/studio/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ startUrl }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Could not start Camoufox session");
          return;
        }
        if (cancelled) return;
        const ws = new WebSocket(data.wsUrl);
        wsRef.current = ws;
        ws.onopen = () => setConnected(true);
        ws.onmessage = (event) => {
          const msg = JSON.parse(String(event.data)) as { type: string; data?: string };
          if (msg.type !== "frame" || !msg.data || !canvasRef.current) return;
          const img = new Image();
          img.onload = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            ctx?.drawImage(img, 0, 0);
          };
          img.src = `data:image/jpeg;base64,${msg.data}`;
        };
        ws.onerror = () => setError("Studio connection failed");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
      wsRef.current?.close();
    };
  }, [startUrl]);

  const sendInput = (payload: Record<string, unknown>) => {
    wsRef.current?.send(JSON.stringify(payload));
  };

  const onCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;
    sendInput({ type: "click", x, y });
  };

  return (
    <div className="browser-studio">
      <p className="muted">
        {connected ? "Camoufox studio (live)" : "Starting Camoufox…"}
        {error ? ` — ${error}` : null}
      </p>
      <canvas
        ref={canvasRef}
        className="browser-frame studio-canvas"
        onClick={onCanvasClick}
        role="img"
        aria-label="Embedded Camoufox browser"
      />
      <p className="muted">Click the image to interact. Legacy iframe preview remains available below when configured.</p>
    </div>
  );
}
