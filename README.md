# VaaniNotes AI

VaaniNotes AI is a local-first AI voice note app for book writing notes, doctor note drafts, student notes, business notes, research notes, meeting notes, personal notes, and general notes.

The app runs without login. Notes, transcripts, audio files, exports, settings, and the SQLite database stay on your local machine. OpenAI is used only when you provide an API key and request transcription, formatting, summarization, or command interpretation.

## Features

- One-click browser voice recording with local audio chunk saving
- SQLite note database with soft delete and restore endpoint
- OpenAI transcription and structured note formatting
- Auto title, note type, summary, tags, transcript, and markdown content
- Tiptap rich text editor with autosave
- Sidebar note list with search, date, type, status, and tags
- Voice command mode with browser SpeechRecognition when available
- Text command fallback with backend parser
- Export to Markdown, TXT, HTML, and PDF
- Local URL, LAN URL, storage path, and QR code in settings
- Local encrypted storage for an in-app OpenAI API key
- Private network warning for LAN use

## Screenshots

Screenshots placeholder: add images after running the app locally.

## Requirements

- Python 3.11+
- Node.js 20+
- An OpenAI API key for transcription and AI formatting

## Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

On Windows:

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

Add your key to `backend/.env`, or save it from the in-app Settings panel:

```bash
OPENAI_API_KEY=sk-your-key
```

Never commit `.env`.

## Frontend Setup

```bash
cd frontend
npm install
```

## Run In Development

Terminal 1:

```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Terminal 2:

```bash
cd frontend
npm run dev -- --host 0.0.0.0
```

Open:

- Local frontend: `http://127.0.0.1:5173`
- Backend health: `http://127.0.0.1:8000/api/health`

The backend prints:

```text
Local: http://127.0.0.1:8000
Network: http://LOCAL_IP:8000
```

## Access From Phone On Same Wi-Fi

Run both servers with `--host 0.0.0.0`, then open the LAN frontend URL from your phone:

```text
http://YOUR_LOCAL_IP:5173
```

Settings also shows the backend LAN URL and a QR code. Use only on a private trusted network.

## Microphone On Wi-Fi/LAN

Browsers block microphone access on insecure LAN pages such as `http://192.168.x.x:8000`. For recording from another device on the same Wi-Fi, run the backend with HTTPS.

Create a local development certificate:

```bash
cd backend
venv/bin/python scripts/create_dev_cert.py
```

If auto-detection prints `127.0.0.1`, pass your LAN IP explicitly:

```bash
venv/bin/python scripts/create_dev_cert.py 192.168.0.196
```

Run the app with HTTPS:

```bash
venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 \
  --ssl-keyfile data/certs/vaaninotes.key \
  --ssl-certfile data/certs/vaaninotes.crt
```

Then open the HTTPS LAN URL shown in the terminal, for example:

```text
https://YOUR_LOCAL_IP:8000
```

If the browser shows a certificate warning, accept it only on your private network. For a fully trusted certificate on all devices, use a local trusted certificate tool such as `mkcert` and run Uvicorn with that certificate.

After microphone permission is allowed once, VaaniNotes automatically uses the browser/system default input device, including a connected headset or earphone microphone.

## Production Build

```bash
cd frontend
npm run build
cd ../backend
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

When `frontend/dist` exists, FastAPI serves the built frontend from the backend server.

## Privacy Notes

- No cloud login
- No cloud database
- No analytics or tracking
- Audio files are saved in `backend/storage/audio`
- Exports are saved in `backend/storage/exports`
- Backups folder is `backend/storage/backups`
- OpenAI calls happen only for transcription, formatting, and AI command parsing when an API key is set

Local network warning:

> This app is designed for private local network use only. Do not run it on public Wi-Fi or expose it to the internet.

## Doctor Note Safety

Doctor notes are AI-prepared drafts only. They are not final medical truth.

The app adds:

> AI prepared draft. Doctor review required.

## API

Implemented endpoints:

- `GET /api/health`
- `GET /api/network-info`
- `GET /api/notes`
- `GET /api/notes/{id}`
- `POST /api/notes`
- `PUT /api/notes/{id}`
- `DELETE /api/notes/{id}`
- `POST /api/notes/{id}/restore`
- `POST /api/audio/start`
- `POST /api/audio/chunk`
- `POST /api/audio/finish`
- `POST /api/ai/transcribe/{note_id}`
- `POST /api/ai/format/{note_id}`
- `POST /api/commands/parse`
- `POST /api/export/{note_id}`
- `GET /api/settings`
- `PUT /api/settings`

## Roadmap

- SQLite FTS5 migration and richer date search
- Semantic search
- Flashcards
- Full version history browser
- Backup and restore UI
- More advanced note templates
- Better phone layout for long recording sessions

## Contributing

Open issues and pull requests are welcome. Keep the app local-first, dependency-light, private by default, and easy to run from VS Code.

## License

MIT
