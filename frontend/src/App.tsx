import { Copy, Download, FileText, Info, Languages, Sparkles, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ConfirmDialog from "./components/ConfirmDialog";
import NoteEditor from "./components/NoteEditor";
import OnboardingGuide from "./components/OnboardingGuide";
import RecorderButton, { type RecorderControls } from "./components/RecorderButton";
import SettingsPanel from "./components/SettingsPanel";
import Sidebar from "./components/Sidebar";
import StatusBanner from "./components/StatusBanner";
import { api, type CommandResult, type Note, type Settings as AppSettings } from "./services/api";

const NOTE_TYPES = [
  "Book Writing",
  "Doctor Note",
  "Student Note",
  "Business Note",
  "Research Note",
  "Meeting Note",
  "Personal Note",
  "General Note"
];

const NOTE_TYPE_HELP: Record<string, string> = {
  "Book Writing": "Draft chapters, scenes, outlines, and long-form writing notes.",
  "Doctor Note": "Medical visit drafts. Shows a doctor-review warning before use.",
  "Student Note": "Class notes, study points, explanations, and revision material.",
  "Business Note": "Work notes, plans, client calls, decisions, and follow-ups.",
  "Research Note": "Research ideas, observations, citations, and experiment notes.",
  "Meeting Note": "Meeting minutes, decisions, attendees, and action items.",
  "Personal Note": "Private thoughts, reminders, diary-style notes, and personal planning.",
  "General Note": "Default flexible note type for anything else."
};

type Banner = { message: string; tone: "info" | "warning" | "error" } | null;
type PendingConfirmation = { title: string; message: string; label: string; phrase?: string; action: () => void } | null;

export default function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [active, setActive] = useState<Note | null>(null);
  const [search, setSearch] = useState("");
  const [banner, setBanner] = useState<Banner>(null);
  const [saveStatus, setSaveStatus] = useState("Saved");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [pending, setPending] = useState<PendingConfirmation>(null);
  const autosaveRef = useRef<number | undefined>();
  const liveSaveRef = useRef<number | undefined>();
  const recorderControlsRef = useRef<RecorderControls | null>(null);
  const editorScrollRef = useRef<HTMLElement | null>(null);

  const showStatus = useCallback((message: string, tone: "info" | "warning" | "error" = "info") => {
    setBanner({ message, tone });
  }, []);

  const loadNotes = useCallback(async (query?: string) => {
    const list = await api.listNotes(query);
    setNotes(list);
    if (!active && list.length > 0) setActive(list[0]);
  }, [active]);

  useEffect(() => {
    loadNotes(search).catch((error) => showStatus(error.message, "error"));
  }, [search, loadNotes, showStatus]);

  useEffect(() => {
    api
      .getSettings()
      .then((loaded) => {
        setSettings(loaded);
        const dismissed = window.localStorage.getItem("vaaninotes:onboarding-dismissed") === "true";
        setShowOnboarding(!loaded.openai_api_key_set && !dismissed);
      })
      .catch((error) => showStatus(error instanceof Error ? error.message : "Settings could not be loaded", "error"));
  }, [showStatus]);

  useEffect(() => {
    if (active?.status !== "recording") return;
    const scrollArea = editorScrollRef.current;
    if (!scrollArea) return;
    scrollArea.scrollTop = scrollArea.scrollHeight;
  }, [active?.plain_text, active?.html_content, active?.status]);

  function openSettingsFromGuide() {
    setShowOnboarding(false);
    setSettingsOpen(true);
  }

  function dismissOnboarding() {
    window.localStorage.setItem("vaaninotes:onboarding-dismissed", "true");
    setShowOnboarding(false);
  }

  function handleSettingsSaved(updated: AppSettings) {
    setSettings(updated);
    if (updated.openai_api_key_set) {
      window.localStorage.setItem("vaaninotes:onboarding-dismissed", "true");
      setShowOnboarding(false);
    }
  }

  async function createNote(): Promise<Note> {
    const note = await api.createNote({ title: "Untitled voice note", note_type: "General Note", status: "saved" });
    setActive(note);
    setNotes((current) => [note, ...current]);
    return note;
  }

  function replaceNote(note: Note) {
    setActive(note);
    mergeNote(note);
  }

  function mergeNote(note: Note) {
    setNotes((current) => {
      const exists = current.some((item) => item.id === note.id);
      const next = exists ? current.map((item) => (item.id === note.id ? note : item)) : [note, ...current];
      return next.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    });
  }

  function escapeHtml(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function liveTranscriptHtml(transcript: string): string {
    const lines = escapeHtml(transcript)
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => `<p>${line}</p>`)
      .join("");
    return `<h2>Live Transcript</h2>${lines || "<p></p>"}`;
  }

  function handleLiveTranscript(noteId: number, transcript: string) {
    const html = liveTranscriptHtml(transcript);
    setActive((current) =>
      current?.id === noteId
        ? {
            ...current,
            raw_transcript: transcript,
            clean_transcript: transcript,
            plain_text: transcript,
            html_content: html,
            status: "recording"
          }
        : current
    );
    setNotes((current) =>
      current.map((note) =>
        note.id === noteId
          ? {
              ...note,
              raw_transcript: transcript,
              clean_transcript: transcript,
              plain_text: transcript,
              html_content: html,
              status: "recording"
            }
          : note
      )
    );
    window.clearTimeout(liveSaveRef.current);
    liveSaveRef.current = window.setTimeout(async () => {
      try {
        await api.updateNote(noteId, {
          raw_transcript: transcript,
          clean_transcript: transcript,
          plain_text: transcript,
          html_content: html,
          status: "recording"
        });
      } catch (error) {
        showStatus(error instanceof Error ? error.message : "Live transcript save failed", "error");
      }
    }, 1200);
  }

  function onEditorChange(html: string, text: string) {
    if (!active) return;
    const localNote = {
      ...active,
      html_content: html,
      plain_text: text,
      clean_transcript: text,
      raw_transcript: active.raw_transcript || text,
      status: "saving"
    };
    setActive(localNote);
    setNotes((current) => current.map((note) => (note.id === active.id ? localNote : note)));
    window.clearTimeout(autosaveRef.current);
    setSaveStatus("Saving...");
    autosaveRef.current = window.setTimeout(async () => {
      try {
        const updated = await api.updateNote(active.id, {
          html_content: html,
          plain_text: text,
          status: "saved"
        });
        replaceNote(updated);
        setSaveStatus("Saved");
      } catch (error) {
        setSaveStatus("Error saving");
        showStatus(error instanceof Error ? error.message : "Auto-save failed", "error");
      }
    }, 900);
  }

  async function updateActive(payload: Partial<Note>) {
    if (!active) return;
    setSaveStatus("Saving...");
    try {
      const updated = await api.updateNote(active.id, payload);
      replaceNote(updated);
      setSaveStatus("Saved");
    } catch (error) {
      setSaveStatus("Error saving");
      showStatus(error instanceof Error ? error.message : "Save failed", "error");
    }
  }

  async function renameNote(note: Note, title: string) {
    setSaveStatus("Saving...");
    try {
      const updated = await api.updateNote(note.id, { title });
      replaceNote(updated);
      setSaveStatus("Saved");
      showStatus("Note renamed.");
    } catch (error) {
      setSaveStatus("Error saving");
      showStatus(error instanceof Error ? error.message : "Rename failed", "error");
    }
  }

  async function deleteActive() {
    if (!active) return;
    await deleteNote(active);
  }

  async function deleteNote(note: Note) {
    const deletingId = note.id;
    const deleted = await api.deleteNote(note.id);
    setNotes((current) => {
      const next = current.filter((note) => note.id !== deleted.id);
      setActive((activeNote) => (activeNote?.id === deletingId ? next[0] ?? null : activeNote));
      return next;
    });
    showStatus("Note moved to trash.");
  }

  async function exportActive(format: "markdown" | "txt" | "html" | "pdf") {
    if (!active) return;
    await exportNote(active, format);
  }

  async function exportNote(note: Note, format: "markdown" | "txt" | "html" | "pdf", confirmed = false) {
    if (note.note_type === "Doctor Note" && !confirmed) {
      setPending({
        title: "Export doctor note?",
        message: "This may contain sensitive medical information. Confirm before exporting.",
        label: "Export",
        phrase: "Yes export",
        action: () => void exportNote(note, format, true)
      });
      return;
    }
    try {
      const result = await api.exportNote(note.id, format);
      window.open(result.download_url, "_blank");
      showStatus(`Export created: ${result.file_name}`);
    } catch (error) {
      showStatus(error instanceof Error ? error.message : "Export failed", "error");
    }
  }

  async function decorateActive() {
    if (!active) return;
    await decorateNote(active);
  }

  async function decorateNote(note: Note) {
    showStatus("Decorating note with OpenAI API...");
    setSaveStatus("Decorating...");
    try {
      const result = await api.decorate(note.id);
      replaceNote(result.note);
      setSaveStatus("Saved");
      showStatus(`Decorated ${noteLabel(note)} and appended Raw Original.`);
    } catch (error) {
      setSaveStatus("Error saving");
      showStatus(error instanceof Error ? error.message : "Decorate failed", "error");
    }
  }

  async function translateNote(note: Note, targetLanguage: string) {
    const target = targetLanguage.trim();
    if (!target) return;
    showStatus(`Translating note to ${target}...`);
    setSaveStatus("Translating...");
    try {
      const result = await api.translate(note.id, target);
      replaceNote(result.note);
      setSaveStatus("Saved");
      showStatus(`Translation appended in ${target}.`);
    } catch (error) {
      setSaveStatus("Error saving");
      showStatus(error instanceof Error ? error.message : "Translate failed", "error");
    }
  }

  async function translateActive() {
    if (!active) return;
    const target = window.prompt("Translate note to which language?", "English")?.trim();
    if (!target) return;
    await translateNote(active, target);
  }

  async function copyActiveText() {
    if (!active) return;
    const text = active.plain_text || active.clean_transcript || active.raw_transcript || active.markdown_content || active.structured_content || "";
    if (!text.trim()) {
      showStatus("There is no text to copy yet.", "warning");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showStatus("Note text copied.");
    } catch {
      showStatus("Copy failed. Please select the text manually.", "error");
    }
  }

  const filteredNotes = useMemo(() => notes, [notes]);

  function findNoteByTitle(title?: unknown): Note | null {
    if (!title || typeof title !== "string") return active;
    const normalized = title.toLowerCase().trim();
    return notes.find((note) => note.title.toLowerCase().includes(normalized)) || null;
  }

  function noteLabel(note: Note | null): string {
    return note ? `"${note.title}"` : "this note";
  }

  function statusText(): string {
    const current = active?.status || "";
    if (!current) return saveStatus;
    if (saveStatus.toLowerCase() === current.toLowerCase()) return saveStatus;
    if (saveStatus === "Saved" && current === "saved") return saveStatus;
    return `${saveStatus} · ${current}`;
  }

  async function submitWakeCommand(command: string) {
    const cleaned = command.trim();
    if (!cleaned) return;
    if (pending) {
      const phrase = (pending.phrase || pending.label || "").toLowerCase();
      const lower = cleaned.toLowerCase();
      if (lower.includes("cancel")) {
        setPending(null);
        showStatus("Command cancelled.");
        return;
      }
      if (phrase && lower.includes(phrase)) {
        const action = pending.action;
        setPending(null);
        action();
        return;
      }
      showStatus(`Say "${pending.phrase || pending.label}" to confirm, or "cancel".`, "warning");
      return;
    }
    showStatus(`Jojo command: ${cleaned}`);
    try {
      const result = await api.parseCommand(`Jojo ${cleaned}`, active?.id, active?.plain_text || active?.summary || "");
      handleCommand(result);
    } catch (error) {
      showStatus(error instanceof Error ? error.message : "Jojo command failed", "error");
    }
  }

  function handleCommand(result: CommandResult) {
    if (result.requires_confirmation) {
      setPending({
        title: "Confirm command",
        message: `This command needs confirmation. Say or choose "${result.confirmation_phrase || "Yes confirm"}" to continue.`,
        label: result.confirmation_phrase || "Confirm",
        phrase: result.confirmation_phrase || "Yes confirm",
        action: () => runCommand(result, true)
      });
      return;
    }
    runCommand(result, false);
  }

  function runCommand(result: CommandResult, confirmed = false) {
    const params = result.parameters;
    switch (result.action) {
      case "search_notes":
        setSearch(String(params.query || ""));
        break;
      case "save_note":
        void updateActive({ status: "saved" });
        showStatus("Saved.");
        break;
      case "save_and_new_note":
        void (async () => {
          if (active) await api.updateNote(active.id, { status: "saved" });
          await createNote();
          setSaveStatus("Saved");
          showStatus("Saved and started a new note.");
        })();
        break;
      case "create_note":
      case "new_note":
      case "start_new_note":
        void createNote();
        showStatus("Started a new note.");
        break;
      case "open_note":
        if (params.mode === "last" && notes[0]) setActive(notes[0]);
        if (params.title) {
          const found = findNoteByTitle(params.title);
          if (found) setActive(found);
          else showStatus(`No note found titled "${String(params.title)}".`, "warning");
        }
        break;
      case "delete_note":
        {
          if (!confirmed) {
            setPending({
              title: "Delete note?",
              message: "This command will move a note to trash. Say or choose \"Yes delete\" to continue.",
              label: "Yes delete",
              phrase: "Yes delete",
              action: () => runCommand(result, true)
            });
            break;
          }
          const target = findNoteByTitle(params.title);
          if (!target) {
            showStatus("No matching note found to delete.", "warning");
            break;
          }
          void deleteNote(target);
        }
        break;
      case "export_note":
        {
          const target = findNoteByTitle(params.title);
          if (!target) {
            showStatus("No matching note found to export.", "warning");
            break;
          }
          const format = (params.format as "markdown" | "txt" | "html" | "pdf") || "pdf";
          void exportNote(target, format, confirmed);
        }
        break;
      case "decorate_note":
        {
          const target = findNoteByTitle(params.title);
          if (!target) {
            showStatus("No matching note found to decorate.", "warning");
            break;
          }
          void decorateNote(target);
        }
        break;
      case "translate_note":
        {
          const target = findNoteByTitle(params.title);
          if (!target) {
            showStatus("No matching note found to translate.", "warning");
            break;
          }
          void translateNote(target, String(params.target_language || "English"));
        }
        break;
      case "rename_note":
        if (typeof params.title === "string" && params.title.trim()) {
          const target = findNoteByTitle(params.target_title);
          if (target) void renameNote(target, params.title.trim());
        } else {
          showStatus("Please say the new title after rename to.", "warning");
        }
        break;
      case "update_note":
        if (typeof params.content === "string" && params.content.trim()) {
          const content = escapeHtml(params.content.trim());
          const target = findNoteByTitle(params.title);
          if (!target) {
            showStatus("No matching note found to update.", "warning");
            break;
          }
          const html = `${target.html_content || ""}<p>${content}</p>`;
          const text = `${target.plain_text || ""}\n${params.content.trim()}`.trim();
          void api.updateNote(target.id, { html_content: html, plain_text: text, status: "saved" }).then(replaceNote);
          showStatus(`Updated ${noteLabel(target)}.`);
        } else if (typeof params.instruction === "string") {
          showStatus("I heard the update command, but need content to add.", "warning");
        }
        break;
      case "change_note_type":
        void updateActive({ note_type: String(params.note_type || "General Note") });
        break;
      case "summarize_note":
        if (active?.summary) showStatus(active.summary);
        else showStatus("No summary is available yet.", "warning");
        break;
      case "start_recording":
        recorderControlsRef.current?.start();
        break;
      case "stop_recording":
        recorderControlsRef.current?.stop();
        break;
      case "pause_recording":
        recorderControlsRef.current?.pause();
        break;
      case "resume_recording":
        recorderControlsRef.current?.resume();
        break;
      default:
        showStatus("Command parsed. Editing commands are kept as text guidance in this MVP.");
    }
  }

  return (
    <div className="app-shell flex min-h-screen bg-white text-gray-950">
      <Sidebar
        notes={filteredNotes}
        activeId={active?.id}
        search={search}
        onSearch={setSearch}
        onNew={() => void createNote()}
        onSelect={setActive}
        onRename={renameNote}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="flex h-screen min-w-0 flex-1 flex-col">
        <header className="flex min-h-[76px] items-center justify-between gap-4 border-b border-gray-200 bg-white px-6">
          <div className="min-w-0">
            <input
              className="w-full truncate border-0 bg-transparent text-xl font-semibold outline-none"
              value={active?.title || ""}
              onChange={(event) => active && setActive({ ...active, title: event.target.value })}
              onBlur={(event) => void updateActive({ title: event.target.value })}
              placeholder="Untitled voice note"
              disabled={!active}
            />
            <div className="mt-1 flex items-center gap-2 text-sm text-gray-600">
              <div className="flex items-center gap-1">
                <select
                  className="rounded border border-gray-200 bg-white px-2 py-1"
                  value={active?.note_type || "General Note"}
                  onChange={(event) => void updateActive({ note_type: event.target.value })}
                  disabled={!active}
                  title={active ? NOTE_TYPE_HELP[active.note_type] || NOTE_TYPE_HELP["General Note"] : "Choose a note type"}
                >
                  {NOTE_TYPES.map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
                <button
                  className="icon-btn h-8 w-8"
                  title={active ? NOTE_TYPE_HELP[active.note_type] || NOTE_TYPE_HELP["General Note"] : "Note types guide formatting and warnings."}
                  disabled={!active}
                >
                  <Info size={15} />
                </button>
              </div>
              <span className="capitalize">{statusText()}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button className="btn-secondary" onClick={() => void copyActiveText()} disabled={!active}>
              <Copy size={17} />
              Copy
            </button>
            <button className="btn-secondary" onClick={() => void decorateActive()} disabled={!active}>
              <Sparkles size={17} />
              Decorate
            </button>
            <button className="btn-secondary" onClick={() => void translateActive()} disabled={!active}>
              <Languages size={17} />
              Translate
            </button>
            <button className="btn-secondary" onClick={() => void exportActive("markdown")} disabled={!active}>
              <FileText size={17} />
              Markdown
            </button>
            <button className="btn-secondary" onClick={() => void exportActive("pdf")} disabled={!active}>
              <Download size={17} />
              PDF
            </button>
            <button
              className="icon-btn"
              disabled={!active}
              title="Delete note"
              onClick={() =>
                setPending({
                  title: "Delete this note?",
                  message: "Are you sure you want to delete this note? It will move to trash.",
                  label: "Delete",
                  action: () => void deleteActive()
                })
              }
            >
              <Trash2 size={18} />
            </button>
          </div>
        </header>

        <div className="border-b border-gray-200">
          <StatusBanner message={banner?.message} tone={banner?.tone} />
        </div>

        <section ref={editorScrollRef} className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
          <div className="mx-auto max-w-4xl">
            {active?.note_type === "Doctor Note" && (
              <StatusBanner message="AI prepared draft. Doctor review required." tone="warning" />
            )}
            <NoteEditor note={active} onChange={onEditorChange} />
          </div>
        </section>

        <div className="border-t border-gray-200 bg-white px-6 py-4">
          <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
            <RecorderButton
              ref={recorderControlsRef}
              note={active}
              onCreateNote={createNote}
              onNoteUpdated={replaceNote}
              onLiveTranscript={handleLiveTranscript}
              onWakeCommand={(command) => void submitWakeCommand(command)}
              onStatus={showStatus}
              confirmationPhrase={pending?.phrase || pending?.label}
            />
            <div className="text-right text-sm text-gray-600">
              <div>Transcript status</div>
              <div className="font-medium capitalize text-gray-900">{active?.status || "Ready"}</div>
            </div>
          </div>
        </div>

      </main>

      <OnboardingGuide open={showOnboarding && !settingsOpen} onOpenSettings={openSettingsFromGuide} onDismiss={dismissOnboarding} />
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onStatus={showStatus}
        onSettingsSaved={handleSettingsSaved}
        highlightApiKey={!settings?.openai_api_key_set}
      />
      <ConfirmDialog
        open={Boolean(pending)}
        title={pending?.title || ""}
        message={pending?.message || ""}
        confirmLabel={pending?.label || "Confirm"}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const action = pending?.action;
          setPending(null);
          action?.();
        }}
      />
    </div>
  );
}
