import { useEffect, useRef, useState } from "react";
import type { Note } from "../services/api";

type Props = {
  notes: Note[];
  activeId?: number;
  onSelect: (note: Note) => void;
  onRename: (note: Note, title: string) => Promise<void>;
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

export default function NoteList({ notes, activeId, onSelect, onRename }: Props) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editingId) inputRef.current?.focus();
  }, [editingId]);

  function startRename(note: Note) {
    setEditingId(note.id);
    setDraftTitle(note.title);
  }

  async function commitRename(note: Note) {
    const nextTitle = draftTitle.trim();
    setEditingId(null);
    if (nextTitle && nextTitle !== note.title) {
      await onRename(note, nextTitle);
    }
  }

  if (!notes.length) {
    return <div className="px-2 py-8 text-center text-sm text-gray-500">No notes found</div>;
  }
  return (
    <div className="space-y-1">
      {notes.map((note) => (
        <div
          key={note.id}
          className={`w-full rounded border p-3 text-left transition ${
            activeId === note.id ? "border-black bg-gray-50" : "border-transparent hover:border-gray-200 hover:bg-gray-50"
          }`}
          onClick={() => onSelect(note)}
        >
          {editingId === note.id ? (
            <input
              ref={inputRef}
              className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm font-semibold outline-none focus:border-black"
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              onBlur={() => void commitRename(note)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void commitRename(note);
                if (event.key === "Escape") {
                  setEditingId(null);
                  setDraftTitle("");
                }
              }}
            />
          ) : (
            <button
              className="line-clamp-2 w-full text-left text-sm font-semibold leading-5"
              onDoubleClick={(event) => {
                event.stopPropagation();
                startRename(note);
              }}
              title="Double-click to rename"
            >
              {note.title}
            </button>
          )}
          <div className="mt-1 flex items-center justify-between gap-2 text-xs text-gray-600">
            <span>{note.note_type}</span>
            <span>{formatDate(note.updated_at)}</span>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs">
            <span className={`status-dot ${note.status === "failed" ? "bg-red-600" : note.status === "processing" ? "bg-gray-800" : "bg-gray-400"}`} />
            <span className="capitalize text-gray-600">{note.status}</span>
          </div>
          {note.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {note.tags.slice(0, 3).map((tag) => (
                <span key={tag} className="rounded border border-gray-200 px-1.5 py-0.5 text-[11px] text-gray-600">{tag}</span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
