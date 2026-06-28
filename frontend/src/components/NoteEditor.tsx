import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import Table from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Heading2, Italic, List, ListOrdered, Quote } from "lucide-react";
import { useEffect } from "react";
import type { Note } from "../services/api";

type Props = {
  note: Note | null;
  onChange: (html: string, text: string) => void;
};

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function markdownToHtml(markdown?: string | null): string {
  if (!markdown) return "";
  const lines = markdown.split("\n");
  let html = "";
  let inList = false;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      if (inList) {
        html += "</ul>";
        inList = false;
      }
      continue;
    }
    if (line.startsWith("### ")) html += `<h3>${escapeHtml(line.slice(4))}</h3>`;
    else if (line.startsWith("## ")) html += `<h2>${escapeHtml(line.slice(3))}</h2>`;
    else if (line.startsWith("# ")) html += `<h1>${escapeHtml(line.slice(2))}</h1>`;
    else if (line.startsWith("- ") || line.startsWith("* ")) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li>${escapeHtml(line.slice(2))}</li>`;
    } else if (line.startsWith("> ")) {
      if (inList) {
        html += "</ul>";
        inList = false;
      }
      html += `<blockquote>${escapeHtml(line.slice(2))}</blockquote>`;
    } else {
      if (inList) {
        html += "</ul>";
        inList = false;
      }
      html += `<p>${escapeHtml(line)}</p>`;
    }
  }
  if (inList) html += "</ul>";
  return html;
}

export default function NoteEditor({ note, onChange }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Highlight.configure({ multicolor: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({ placeholder: "Start recording or type your note..." })
    ],
    content: "",
    editorProps: {
      attributes: {
        class: "prose prose-neutral max-w-none min-h-[56vh] focus:outline-none"
      }
    },
    onUpdate({ editor }) {
      onChange(editor.getHTML(), editor.getText());
    }
  });

  useEffect(() => {
    if (!editor) return;
    const html = note?.html_content || markdownToHtml(note?.markdown_content || note?.structured_content) || "";
    if (html !== editor.getHTML()) {
      editor.commands.setContent(html, false);
    }
  }, [editor, note?.id, note?.html_content, note?.markdown_content, note?.structured_content]);

  if (!note) {
    return (
      <div className="flex min-h-[56vh] items-center justify-center border border-dashed border-gray-300 bg-white p-8 text-center text-gray-500">
        Create or select a note to begin.
      </div>
    );
  }

  return (
    <div className="bg-white">
      <div className="mb-3 flex flex-wrap gap-1 border-b border-gray-200 pb-3">
        <button className="icon-btn" title="Bold" onClick={() => editor?.chain().focus().toggleBold().run()}>
          <Bold size={17} />
        </button>
        <button className="icon-btn" title="Italic" onClick={() => editor?.chain().focus().toggleItalic().run()}>
          <Italic size={17} />
        </button>
        <button className="icon-btn" title="Heading" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 size={17} />
        </button>
        <button className="icon-btn" title="Bullet list" onClick={() => editor?.chain().focus().toggleBulletList().run()}>
          <List size={17} />
        </button>
        <button className="icon-btn" title="Numbered list" onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
          <ListOrdered size={17} />
        </button>
        <button className="icon-btn" title="Quote" onClick={() => editor?.chain().focus().toggleBlockquote().run()}>
          <Quote size={17} />
        </button>
      </div>
      <EditorContent editor={editor} className="editor-page" />
    </div>
  );
}
