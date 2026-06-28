import re
from datetime import datetime
from html import escape
from pathlib import Path

from markdown import markdown
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer

from ..config import EXPORTS_DIR
from ..models import Note
from .note_service import tags_from_json


def _safe_name(title: str) -> str:
    base = re.sub(r"[^a-zA-Z0-9_-]+", "-", title.strip()).strip("-").lower()
    return base[:80] or "voice-note"


def note_markdown(note: Note) -> str:
    tags = ", ".join(tags_from_json(note.tags_json))
    content = note.markdown_content or note.structured_content or note.clean_transcript or note.raw_transcript or ""
    return (
        f"# {note.title}\n\n"
        f"- Type: {note.note_type}\n"
        f"- Created: {note.created_at:%Y-%m-%d %H:%M}\n"
        f"- Updated: {note.updated_at:%Y-%m-%d %H:%M}\n"
        f"- Tags: {tags or 'None'}\n\n"
        f"{content}\n"
    )


def _inline_markup(text: str) -> str:
    safe = escape(text)
    safe = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", safe)
    safe = re.sub(r"\*(.+?)\*", r"<i>\1</i>", safe)
    safe = re.sub(r"`(.+?)`", r"<font name='Courier'>\1</font>", safe)
    return safe


def _pdf_story(note: Note, md: str) -> list:
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="Meta",
            parent=styles["BodyText"],
            fontSize=9,
            leading=13,
            textColor=colors.HexColor("#555555"),
            spaceAfter=5,
        )
    )
    styles.add(
        ParagraphStyle(
            name="NoteBody",
            parent=styles["BodyText"],
            fontSize=10.5,
            leading=16,
            spaceAfter=7,
        )
    )
    styles.add(
        ParagraphStyle(
            name="NoteBullet",
            parent=styles["NoteBody"],
            leftIndent=18,
            firstLineIndent=0,
            bulletIndent=6,
        )
    )
    story = [
        Paragraph(escape(note.title), styles["Title"]),
        Spacer(1, 8),
        Paragraph(f"<b>Type:</b> {escape(note.note_type)}", styles["Meta"]),
        Paragraph(f"<b>Created:</b> {note.created_at:%Y-%m-%d %H:%M}", styles["Meta"]),
        Paragraph(f"<b>Updated:</b> {note.updated_at:%Y-%m-%d %H:%M}", styles["Meta"]),
    ]
    tags = ", ".join(tags_from_json(note.tags_json))
    if tags:
        story.append(Paragraph(f"<b>Tags:</b> {escape(tags)}", styles["Meta"]))
    story.extend([Spacer(1, 8), HRFlowable(width="100%", color=colors.HexColor("#dddddd")), Spacer(1, 12)])

    content_started = False
    for raw in md.splitlines():
        line = raw.strip()
        if not line:
            story.append(Spacer(1, 5))
            continue
        if line == f"# {note.title}" or line.startswith("- Type:") or line.startswith("- Created:") or line.startswith("- Updated:") or line.startswith("- Tags:"):
            continue
        if line.startswith("### "):
            story.append(Paragraph(_inline_markup(line[4:]), styles["Heading3"]))
        elif line.startswith("## "):
            story.append(Paragraph(_inline_markup(line[3:]), styles["Heading2"]))
        elif line.startswith("# "):
            story.append(Paragraph(_inline_markup(line[2:]), styles["Heading1"]))
        elif line.startswith(("- ", "* ")):
            story.append(Paragraph(_inline_markup(line[2:]), styles["NoteBullet"], bulletText="•"))
        elif re.match(r"^\d+\.\s+", line):
            story.append(Paragraph(_inline_markup(re.sub(r"^\d+\.\s+", "", line)), styles["NoteBullet"], bulletText="•"))
        elif line.startswith("> "):
            story.append(Paragraph(f"<i>{_inline_markup(line[2:])}</i>", styles["NoteBody"]))
        elif set(line) <= {"-", "_", "*"} and len(line) >= 3:
            story.append(HRFlowable(width="100%", color=colors.HexColor("#dddddd")))
        else:
            story.append(Paragraph(_inline_markup(line), styles["NoteBody"]))
        content_started = True

    if not content_started:
        story.append(Paragraph("No note content available.", styles["NoteBody"]))
    return story


def export_note(note: Note, fmt: str) -> tuple[str, Path]:
    stamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    filename = f"{_safe_name(note.title)}-{stamp}.{ 'md' if fmt == 'markdown' else fmt }"
    path = EXPORTS_DIR / filename
    md = note_markdown(note)
    if fmt == "markdown":
        path.write_text(md, encoding="utf-8")
    elif fmt == "txt":
        text = note.plain_text or note.clean_transcript or note.raw_transcript or md
        path.write_text(text, encoding="utf-8")
    elif fmt == "html":
        html_content = note.html_content or markdown(md, extensions=["tables", "extra"])
        path.write_text(
            f"<!doctype html><html><head><meta charset='utf-8'><title>{note.title}</title>"
            "<style>body{font-family:Inter,system-ui,sans-serif;max-width:760px;margin:40px auto;line-height:1.65;color:#111}</style>"
            f"</head><body>{html_content}</body></html>",
            encoding="utf-8",
        )
    elif fmt == "pdf":
        doc = SimpleDocTemplate(
            str(path),
            pagesize=letter,
            title=note.title,
            leftMargin=0.75 * inch,
            rightMargin=0.75 * inch,
            topMargin=0.7 * inch,
            bottomMargin=0.7 * inch,
        )
        doc.build(_pdf_story(note, md))
    else:
        raise ValueError("Unsupported export format")
    return filename, path
