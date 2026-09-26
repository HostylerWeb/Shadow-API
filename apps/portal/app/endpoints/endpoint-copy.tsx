"use client";

import { useState } from "react";

export function EndpointCopy({
  connectorId,
  title,
  description,
  action,
}: {
  connectorId: string;
  title: string;
  description: string;
  action: (formData: FormData) => void;
}) {
  const [editing, setEditing] = useState<"title" | "description" | null>(null);
  return (
    <form action={action} className="endpoint-copy">
      <input type="hidden" name="connector_id" value={connectorId} />
      {editing === "title" ? (
        <input key="title-edit" name="title" defaultValue={title} required aria-label="Endpoint name" autoFocus />
      ) : (
        <input key="title-keep" type="hidden" name="title" defaultValue={title} />
      )}
      {editing === "description" ? (
        <input key="description-edit" name="description" defaultValue={description} aria-label="Description" autoFocus />
      ) : (
        <input key="description-keep" type="hidden" name="description" defaultValue={description} />
      )}
      <div className="endpoint-title-row">
        {editing === "title" ? null : <h2>{title}</h2>}
        <button type="button" className="icon-btn" aria-label="Rename endpoint" onClick={() => setEditing("title")}>
          <Pencil />
        </button>
      </div>
      <div className="endpoint-desc-row">
        {editing === "description" ? null : <p>{description || "Add a description"}</p>}
        <button type="button" className="icon-btn" aria-label="Edit description" onClick={() => setEditing("description")}>
          <Pencil />
        </button>
      </div>
      {editing ? (
        <div className="endpoint-copy-save">
          <button type="submit" className="btn-primary">Save</button>
          <button type="button" className="btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
        </div>
      ) : null}
    </form>
  );
}

function Pencil() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M4 20h4l10-10-4-4L4 16v4z" />
      <path d="M13 7l4 4" />
    </svg>
  );
}
