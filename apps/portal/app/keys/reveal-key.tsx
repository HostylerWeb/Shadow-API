"use client";

import { useState } from "react";

export function RevealKey({
  keyId,
  name,
  prefix,
  canReveal,
  reveal,
}: {
  keyId: string;
  name: string;
  prefix: string;
  canReveal: boolean;
  reveal: (keyId: string) => Promise<string | null>;
}) {
  const [secret, setSecret] = useState<string | null>(null);
  const [note, setNote] = useState("");

  async function onReveal() {
    if (!canReveal) {
      setNote("The full key was shown only when it was created. Create a new key to copy one.");
      return;
    }
    const value = await reveal(keyId);
    if (!value) {
      setNote("The full key was shown only when it was created. Create a new key to copy one.");
      return;
    }
    setSecret(value);
    try {
      await navigator.clipboard.writeText(value);
      setNote("Copied");
    } catch {
      setNote("Copy it from the row.");
    }
  }

  return (
    <div className="key-reveal">
      <span>
        {name} · {secret ? <code className="key-secret">{secret}</code> : `${prefix}…`}
      </span>
      {canReveal ? (
        <button type="button" className="btn-ghost" onClick={() => void onReveal()}>
          Reveal key
        </button>
      ) : (
        <span className="muted">Full key was not saved</span>
      )}
      {note ? <span className="muted">{note}</span> : null}
    </div>
  );
}
