import { Mic, Plus, Settings } from "lucide-react";
import type { Note } from "../services/api";
import NoteList from "./NoteList";
import SearchBar from "./SearchBar";

type Props = {
  notes: Note[];
  activeId?: number;
  search: string;
  onSearch: (value: string) => void;
  onNew: () => void;
  onSelect: (note: Note) => void;
  onRename: (note: Note, title: string) => Promise<void>;
  onOpenSettings: () => void;
};

export default function Sidebar({ notes, activeId, search, onSearch, onNew, onSelect, onRename, onOpenSettings }: Props) {
  return (
    <aside className="flex h-screen w-[300px] shrink-0 flex-col border-r border-gray-200 bg-white">
      <div className="border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-normal">VaaniNotes AI</h1>
            <p className="mt-1 text-xs text-gray-600">Local-first voice notes</p>
          </div>
          <button className="icon-btn" onClick={onOpenSettings} title="Settings">
            <Settings size={18} />
          </button>
        </div>
        <button className="btn-primary mt-4 w-full justify-center" onClick={onNew}>
          <Plus size={18} />
          New Voice Note
        </button>
      </div>
      <div className="border-b border-gray-200 p-4">
        <SearchBar value={search} onChange={onSearch} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <NoteList notes={notes} activeId={activeId} onSelect={onSelect} onRename={onRename} />
      </div>
      <div className="border-t border-gray-200 p-3 text-xs text-gray-600">
        <div className="flex items-center gap-2">
          <Mic size={14} />
          Audio and notes stay on this computer.
        </div>
      </div>
    </aside>
  );
}
