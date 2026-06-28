import { Download, FileText, Sparkles, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ConfirmDialog from "./components/ConfirmDialog";
import NoteEditor from "./components/NoteEditor";
import OnboardingGuide from "./components/OnboardingGuide";
import RecorderButton from "./components/RecorderButton";
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

type Banner = { message: string; tone: "info" | "warning" | "error" } | null;
type PendingConfirmation = { title: string; message: string; label: string; action: () => void } | null;

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
    const deletingId = active.id;
    const deleted = await api.deleteNote(active.id);
    setNotes((current) => current.filter((note) => note.id !== deleted.id));
    setActive(notes.find((note) => note.id !== deletingId) ?? null);
    showStatus("Note moved to trash.");
  }

  async function exportActive(format: "markdown" | "txt" | "html" | "pdf") {
    if (!active) return;
    if (active.note_type === "Doctor Note") {
      setPending({
        title: "Export doctor note?",
        message: "This may contain sensitive medical information. Confirm before exporting.",
        label: "Export",
        action: () => void exportActiveConfirmed(format)
      });
      return;
    }
    await exportActiveConfirmed(format);
  }

  async function exportActiveConfirmed(format: "markdown" | "txt" | "html" | "pdf") {
    if (!active) return;
    try {
      const result = await api.exportNote(active.id, format);
      window.open(result.download_url, "_blank");
      showStatus(`Export created: ${result.file_name}`);
    } catch (error) {
      showStatus(error instanceof Error ? error.message : "Export failed", "error");
    }
  }

  async function decorateActive() {
    if (!active) return;
    showStatus("Decorating note with OpenAI API...");
    setSaveStatus("Decorating...");
    try {
      const result = await api.decorate(active.id);
      replaceNote(result.note);
      setSaveStatus("Saved");
      showStatus("Note decorated and saved.");
    } catch (error) {
      setSaveStatus("Error saving");
      showStatus(error instanceof Error ? error.message : "Decorate failed", "error");
    }
  }

  const filteredNotes = useMemo(() => notes, [notes]);

  async function submitWakeCommand(command: string) {
    const cleaned = command.trim();
    if (!cleaned) return;
    showStatus(`Vaani command: ${cleaned}`);
    try {
      const result = await api.parseCommand(`Vaani ${cleaned}`, active?.id, active?.plain_text || active?.summary || "");
      handleCommand(result);
    } catch (error) {
      showStatus(error instanceof Error ? error.message : "Vaani command failed", "error");
    }
  }

  function handleCommand(result: CommandResult) {
    if (result.requires_confirmation) {
      setPending({
        title: "Confirm command",
        message: `This command needs confirmation. Say or choose "${result.confirmation_phrase || "Yes confirm"}" to continue.`,
        label: result.confirmation_phrase || "Confirm",
        action: () => runCommand(result)
      });
      return;
    }
    runCommand(result);
  }

  function runCommand(result: CommandResult) {
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
          const found = notes.find((note) => note.title.toLowerCase().includes(String(params.title).toLowerCase()));
          if (found) setActive(found);
        }
        break;
      case "delete_note":
        void deleteActive();
        break;
      case "export_note":
        void exportActiveConfirmed((params.format as "markdown" | "txt" | "html" | "pdf") || "markdown");
        break;
      case "change_note_type":
        void updateActive({ note_type: String(params.note_type || "General Note") });
        break;
      case "summarize_note":
        if (active?.summary) showStatus(active.summary);
        else showStatus("No summary is available yet.", "warning");
        break;
      case "start_recording":
        showStatus("Use the Start Voice Note button to begin recording.");
        break;
      case "stop_recording":
        showStatus("Use the Stop button in the recording controls.");
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
            <div className="mt-1 flex items-center gap-3 text-sm text-gray-600">
              <select
                className="rounded border border-gray-200 bg-white px-2 py-1"
                value={active?.note_type || "General Note"}
                onChange={(event) => void updateActive({ note_type: event.target.value })}
                disabled={!active}
              >
                {NOTE_TYPES.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
              <span>{saveStatus}</span>
              {active?.status && <span className="capitalize">{active.status}</span>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button className="btn-secondary" onClick={() => void decorateActive()} disabled={!active}>
              <Sparkles size={17} />
              Decorate
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

        <section className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
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
              note={active}
              onCreateNote={createNote}
              onNoteUpdated={replaceNote}
              onLiveTranscript={handleLiveTranscript}
              onWakeCommand={(command) => void submitWakeCommand(command)}
              onStatus={showStatus}
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
