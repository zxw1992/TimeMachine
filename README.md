# AI Time Machine

> 中文版：[README_zh.md](./README_zh.md)

![CI](https://github.com/zxw1992/TimeMachine/actions/workflows/ci.yml/badge.svg)

A personal multimodal memory timeline. Drop in **what you see** (images, screenshots), **what you hear** (voice recordings), and **what you think** (text), and a multimodal AI organizes them into timestamped, searchable entries you can revisit later.

- **Platform**: macOS (runs locally in your browser at `localhost`)
- **Backend**: Python 3.11 + FastAPI
- **Storage**: SQLite + [sqlite-vec](https://github.com/asg017/sqlite-vec) for on-device vector search
- **AI**: Pluggable providers — Claude / OpenAI / Gemini / Alibaba Bailian (Qwen), or any OpenAI-compatible endpoint (Ollama, DeepSeek, OpenRouter, …); switchable in-app
- **Frontend**: Vite + React + TailwindCSS + a custom timeline
- **UI**: bilingual (English / 中文), light / dark / system theme

---

## Quick Start

### 1. Get an API key

You need at least an **OpenAI** key (used by default for Whisper transcription and embeddings). Optionally add Claude / Gemini / Bailian for vision and title generation.

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env`:

```env
AI_PROVIDER=claude            # primary provider (image description + title)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...         # required: Whisper + embeddings
```

If you only have an OpenAI key, set `AI_PROVIDER=openai` and leave the Anthropic key empty.

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

```bash
./scripts/start.sh
```

- Backend: http://127.0.0.1:8000 (Swagger at `/docs`)
- Frontend: http://localhost:5173

---

## Usage

Open http://localhost:5173 in your browser:

- **Capture** — choose text / image / audio, then type or upload. `⌘V` pastes a screenshot directly, and you can drop in **several images at once** (each becomes its own entry). Audio records via the browser microphone. Entries are saved immediately and organized by AI in the background, with staged progress; you can optionally set a custom timestamp to backdate a memory. First-time users get a short setup guide, and past memories resurface under **"On this day."**
- **Timeline** — a vertical "river of time" grouped by day, with a monthly **calendar heatmap** for a bird's-eye view. Click any title to open the detail drawer on the right.
- **Search** — describe what you're looking for in natural language (e.g. *"the menu I saw last week"*); results are ranked by semantic similarity.
- **Settings** — configure AI providers, API keys, and models live; add custom OpenAI-compatible providers; switch language and theme. No file editing or restart.

---

## Data location

Everything lives under `backend/data/`:

```
data/
├── timemachine.db      # SQLite (entries + FTS5 + vec0)
└── uploads/YYYY/MM/    # original images and audio; thumbs/ for thumbnails
```

To back up, copy the entire `data/` directory.

---

## Using Alibaba Bailian (Qwen)

Bailian exposes an OpenAI-compatible endpoint, so the same `openai` SDK is reused with a custom `base_url`. Configure in `.env`:

```env
AI_PROVIDER=bailian
DASHSCOPE_API_KEY=sk-...
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
DASHSCOPE_TEXT_MODEL=qwen-plus
DASHSCOPE_VISION_MODEL=qwen-vl-plus
DASHSCOPE_EMBEDDING_MODEL=text-embedding-v3
DASHSCOPE_EMBEDDING_DIM=1024

EMBEDDING_PROVIDER=same
TRANSCRIBE_PROVIDER=openai    # Bailian compat mode has no audio transcription
```

**Region base URLs**:
- Beijing: `https://dashscope.aliyuncs.com/compatible-mode/v1`
- Singapore: `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`
- US (Virginia): `https://dashscope-us.aliyuncs.com/compatible-mode/v1`

Model IDs are passed through verbatim — no allowlist in code, so new Qwen models work as soon as they're available.

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
- Tags, favorites, edit
- Multi-user, cloud sync, encryption
- AI-generated monthly / yearly recap reports

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
