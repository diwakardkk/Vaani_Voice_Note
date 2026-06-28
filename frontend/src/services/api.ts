export type Note = {
  id: number;
  title: string;
  note_type: string;
  raw_transcript?: string | null;
  clean_transcript?: string | null;
  structured_content?: string | null;
  plain_text?: string | null;
  html_content?: string | null;
  markdown_content?: string | null;
  summary?: string | null;
  tags: string[];
  audio_path?: string | null;
  status: "saved" | "saving" | "recording" | "processing" | "failed" | string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  is_deleted: boolean;
};

export type Settings = {
  openai_api_key_set: boolean;
  delete_audio_after_transcription: boolean;
  allow_lan_access: boolean;
  local_url: string;
  network_url: string;
  https_local_url?: string;
  https_network_url?: string;
  storage_path: string;
};

export type CommandResult = {
  action: string;
  parameters: Record<string, unknown>;
  requires_confirmation: boolean;
  confirmation_phrase: string;
};

const jsonHeaders = { "Content-Type": "application/json" };

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try {
      const payload = await response.json();
      message = payload.detail || message;
    } catch {
      message = await response.text();
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export const api = {
  listNotes: (q?: string) => request<Note[]>(`/api/notes${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  getNote: (id: number) => request<Note>(`/api/notes/${id}`),
  createNote: (payload: Partial<Note>) =>
    request<Note>("/api/notes", { method: "POST", headers: jsonHeaders, body: JSON.stringify(payload) }),
  updateNote: (id: number, payload: Partial<Note>) =>
    request<Note>(`/api/notes/${id}`, { method: "PUT", headers: jsonHeaders, body: JSON.stringify(payload) }),
  deleteNote: (id: number) => request<Note>(`/api/notes/${id}`, { method: "DELETE" }),
  restoreNote: (id: number) => request<Note>(`/api/notes/${id}/restore`, { method: "POST" }),
  startAudio: (note_id: number, mime_type?: string, baseline_text?: string) =>
    request<{ session_id: string; note_id: number; file_name: string }>("/api/audio/start", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ note_id, mime_type, baseline_text })
    }),
  uploadChunk: (session_id: string, blob: Blob) => {
    const form = new FormData();
    form.append("session_id", session_id);
    form.append("chunk_file", blob, "chunk.webm");
    return request<{ ok: boolean; bytes_written: number }>("/api/audio/chunk", { method: "POST", body: form });
  },
  finishAudio: (session_id: string) =>
    request<{ ok: boolean; note_id: number; audio_path: string }>("/api/audio/finish", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ session_id })
    }),
  transcribe: (noteId: number) =>
    request<{ raw_transcript: string; note: Note }>(`/api/ai/transcribe/${noteId}`, { method: "POST" }),
  format: (noteId: number) => request<{ formatted: unknown; note: Note }>(`/api/ai/format/${noteId}`, { method: "POST" }),
  decorate: (noteId: number) =>
    request<{ decorated: unknown; note: Note }>(`/api/ai/decorate/${noteId}`, { method: "POST" }),
  exportNote: (noteId: number, format: "markdown" | "txt" | "html" | "pdf") =>
    request<{ file_name: string; file_path: string; download_url: string }>(`/api/export/${noteId}`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ format })
    }),
  parseCommand: (command_text: string, current_note_id?: number, current_note_context?: string) =>
    request<CommandResult>("/api/commands/parse", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ command_text, current_note_id, current_note_context })
    }),
  getSettings: () => request<Settings>("/api/settings"),
  updateSettings: (payload: { openai_api_key?: string; delete_audio_after_transcription?: boolean; allow_lan_access?: boolean }) =>
    request<Settings>("/api/settings", { method: "PUT", headers: jsonHeaders, body: JSON.stringify(payload) })
};
