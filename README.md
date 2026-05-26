# AI Time Machine

> 中文版：[README_zh.md](./README_zh.md)

![CI](https://github.com/zxw1992/TimeMachine/actions/workflows/ci.yml/badge.svg)

A personal multimodal memory timeline. Drop in **what you see** (images, screenshots), **what you hear** (voice recordings), and **what you think** (text), and a multimodal AI organizes them into timestamped, searchable entries you can revisit later.

- **Platform**: macOS / Windows / Linux (runs locally in your browser at `localhost`)
- **Backend**: Python 3.11 + FastAPI
- **Storage**: SQLite + [sqlite-vec](https://github.com/asg017/sqlite-vec) for on-device vector search
- **AI**: Pluggable providers — Claude / OpenAI / Gemini / Alibaba Bailian (Qwen), or any OpenAI-compatible endpoint (Ollama, DeepSeek, OpenRouter, …); switchable in-app
- **Frontend**: Vite + React + TailwindCSS + a custom timeline
- **UI**: bilingual (English / 中文), light / dark / system theme

---

## Quick Start

### 1. Get an API key

This guide uses **Alibaba Bailian (Qwen)** as the example provider: a single key covers image description, titles, **and** embeddings, so text, image, and search work out of the box. (Any of Claude / OpenAI / Gemini, or any OpenAI-compatible endpoint, works just as well — see [Switching providers](#switching-providers).)

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env`:

```env
AI_PROVIDER=bailian           # primary provider (image description + title)
DASHSCOPE_API_KEY=sk-...
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
DASHSCOPE_TEXT_MODEL=qwen-plus
DASHSCOPE_VISION_MODEL=qwen-vl-plus
DASHSCOPE_EMBEDDING_MODEL=text-embedding-v3
DASHSCOPE_EMBEDDING_DIM=1024

EMBEDDING_PROVIDER=same        # reuse Bailian for embeddings
TRANSCRIBE_PROVIDER=openai     # Bailian has no audio transcription
# OPENAI_API_KEY=sk-...        # only needed if you record audio (Whisper)
```

> A single Bailian key powers text, image, and semantic search. **Audio transcription** is the one gap — it needs an OpenAI (Whisper) key, so add `OPENAI_API_KEY` only if you use voice capture.

> You don't have to edit `.env` by hand: keys, providers, and models can also be configured later in the in-app **Settings** page (gear icon) — changes apply live, no restart. `.env` just seeds the first run.

### 2. Install dependencies

Backend (uses [uv](https://docs.astral.sh/uv/); falls back to venv if not installed):

```bash
cd backend
uv sync          # or: pip install -e .
```

Frontend:

```bash
cd frontend
npm install
```

### 3. Run

**macOS / Linux:**

```bash
./scripts/start.sh
```

**Windows (PowerShell):**

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start.ps1
```

- Backend: http://127.0.0.1:8000 (Swagger at `/docs`)
- Frontend: http://localhost:5173

> The UI uses system fonts. On Windows/Linux it falls back to the local CJK serif (SimSun / Noto Serif CJK), so the look is close to — but not pixel-identical to — macOS. Use a Chromium-based browser or Firefox for microphone recording.

---

## Usage

Open http://localhost:5173 in your browser:

- **Capture** — jot text, drop images (`⌘V` or several at once), or record audio, and add tags as you go. Entries are organized by AI in the background; past ones resurface as **"On this day."**
- **Timeline** — a vertical "river of time" by day, with a calendar heatmap and tag / favorite filters. Open any entry to read it, edit the title / body / time, favorite it (♥), or tag it — with one-click **AI tag suggestions**.
- **Search** — find memories by meaning, in natural language.
- **Review** — weekly / monthly recaps: instant stats (counts, activity, top tags) plus an on-demand **AI summary** — a headline, a story-like narrative, themes, and a generated poster.
- **Settings** — switch AI providers, models, and keys live; **export** a full backup (or Markdown) and re-import it. No file editing or restart.

---

## Data location

Everything lives under `backend/data/`:

```
data/
├── timemachine.db      # SQLite (entries + FTS5 + vec0)
└── uploads/YYYY/MM/    # original images and audio; thumbs/ for thumbnails
```

To back up, copy the entire `data/` directory — or use **Settings → Data** to export a backup (a zip with your data and media) that you can re-import later.

---

## Switching providers

The Quick Start uses Bailian, but the primary provider is pluggable. Set `AI_PROVIDER` and the matching key:

| Provider | `AI_PROVIDER` | Key env var | Built-in capabilities |
|---|---|---|---|
| Alibaba Bailian (Qwen) | `bailian` | `DASHSCOPE_API_KEY` | vision · title · embed |
| OpenAI | `openai` | `OPENAI_API_KEY` | vision · title · embed · transcribe |
| Gemini | `gemini` | `GEMINI_API_KEY` | vision · title · embed · transcribe |
| Claude | `claude` | `ANTHROPIC_API_KEY` | vision · title |
| Any OpenAI-compatible | add in **Settings** | — | Ollama / DeepSeek / OpenRouter … |

The three AI roles are independent — `AI_PROVIDER` (vision + title), `EMBEDDING_PROVIDER`, `TRANSCRIBE_PROVIDER` — so you can mix providers (e.g. Bailian for vision, OpenAI for transcription). Set a role to `same` to reuse the primary; if the primary can't do that job, it falls back to OpenAI. Model IDs are passed through verbatim — no allowlist in code, so new models work as soon as they're available.

**Bailian region endpoints** (`DASHSCOPE_BASE_URL`):
- Beijing: `https://dashscope.aliyuncs.com/compatible-mode/v1`
- Singapore: `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`
- US (Virginia): `https://dashscope-us.aliyuncs.com/compatible-mode/v1`

---

## Embedding dimensions

The `entries_vec` table's vector dimension is locked to whatever the **first** embedding model returns (1536 for OpenAI `text-embedding-3-small`, 768 for Gemini, 1024 for Qwen `text-embedding-v3`). To switch embedding models later, use **Reindex** in the Settings page — it re-embeds all existing entries with the new model — or clear the database to start fresh:

```bash
rm backend/data/timemachine.db
```

---

## Out of scope (for now)

- Automatic screenshot / always-on microphone (privacy-sensitive)
- Global hotkey / menu-bar app
- Multi-user, cloud sync, encryption
- Importing from other apps (Day One / Bear / Notion); PDF export

---

## Development

```bash
cd backend && uv sync --group dev
uv run pytest          # backend tests
uv run ruff check .    # lint

cd ../frontend && npm run build   # typecheck + build
```

GitHub Actions runs the backend tests and the frontend build on every push and pull request. Optionally install the pre-commit hooks to run the same checks locally:

```bash
pre-commit install
```

---

## License

[MIT](./LICENSE)
