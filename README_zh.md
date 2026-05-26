# AI 时光机 (AITimeMachine)

> English: [README.md](./README.md)

![CI](https://github.com/zxw1992/TimeMachine/actions/workflows/ci.yml/badge.svg)

把**看到的（图片/截图）**、**听到的（录音）**、**想到的（文字）**随手丢进时光机，AI 自动整理成带时间戳的条目，并支持自然语言模糊检索。

- 平台：macOS / Windows / Linux（本地 Web 应用，浏览器访问 `localhost:5173`）
- 后端：Python 3.11 + FastAPI
- 存储：SQLite + sqlite-vec（本地向量检索）
- AI：Claude / OpenAI / Gemini / 阿里云百炼（Qwen）可切换，也支持任意 OpenAI 兼容端点（Ollama、DeepSeek、OpenRouter…）；可在应用内切换
- 前端：Vite + React + Tailwind + 自绘时间轴
- 界面：中 / 英双语，明 / 暗 / 跟随系统主题

---

## 快速开始

### 1. 准备 API Key

本文以**阿里云百炼（Qwen）**为示例 provider：一把 Key 就能覆盖图像描述、标题**和** Embeddings，所以文字、图片、检索开箱即用。（Claude / OpenAI / Gemini，或任意 OpenAI 兼容端点也都一样用 —— 见[切换 provider](#切换-provider)。）

```bash
cd backend
cp .env.example .env
```

编辑 `backend/.env`，填入：

```env
AI_PROVIDER=bailian           # 主 provider（图像描述 + 标题）
DASHSCOPE_API_KEY=sk-...
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
DASHSCOPE_TEXT_MODEL=qwen-plus
DASHSCOPE_VISION_MODEL=qwen-vl-plus
DASHSCOPE_EMBEDDING_MODEL=text-embedding-v3
DASHSCOPE_EMBEDDING_DIM=1024

EMBEDDING_PROVIDER=same        # 跟随主 provider（百炼）做 Embeddings
TRANSCRIBE_PROVIDER=openai     # 百炼不支持音频转写
# OPENAI_API_KEY=sk-...        # 仅当你要录音时才需要（Whisper）
```

> 一把百炼 Key 就能驱动文字、图片和语义检索。唯一的缺口是**音频转写**，它需要 OpenAI（Whisper）Key —— 只有用语音记录时才需要补上 `OPENAI_API_KEY`。

> 也不必手动改 `.env`：密钥、provider、模型都可以之后在应用内的**设置**页（齿轮图标）配置，改完即时生效、无需重启。`.env` 只是首次启动的初始值。

### 2. 安装依赖

**后端**（推荐 [uv](https://docs.astral.sh/uv/)，没有的话脚本会自动 fallback 到 venv）：

```bash
cd backend
uv sync           # 或者 pip install -e .
```

**前端**：

```bash
cd frontend
npm install
```

### 3. 启动

**macOS / Linux：**

```bash
./scripts/start.sh
```

**Windows（PowerShell）：**

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start.ps1
```

- 后端：http://127.0.0.1:8000
- 前端：http://localhost:5173

> 界面用系统字体。Windows/Linux 会回退到本地的中文衬线字体（宋体 / Noto Serif CJK），观感接近 macOS 但非像素级一致。录音请用 Chromium 内核浏览器或 Firefox。

---

## 使用

打开 http://localhost:5173

- **录入**：随手记文字、丢图片（⌘V 粘贴或一次多张）、或录音，可顺手加标签。条目后台 AI 整理，往年的会以**"那年今日"**浮现。
- **时间线**：纵向"时间之河"按天分组，配日历热力图，可按标签 / 收藏筛选。点开任一条可阅读、编辑标题 / 正文 / 时间、收藏（♥）、加标签——含一键 **AI 建议标签**。
- **检索**：用自然语言按语义找回记忆。
- **回顾**：周报 / 月报——即时统计（条数、活跃、热门标签）+ 按需 **AI 回顾**：标题、有故事感的叙述、主题，以及一张生成的海报。
- **设置**：应用内切换 provider / 模型 / 密钥；**导出**完整备份（或 Markdown）并可重新导入。即时生效、无需改文件或重启。

---

## 数据位置

所有数据都在 `backend/data/`：

```
data/
├── timemachine.db      # SQLite（含 entries / FTS / vec0）
└── uploads/YYYY/MM/    # 原始图片和音频；thumbs/ 是缩略图
```

备份就是直接拷走 `data/` 目录——或者在**设置 → 数据**里导出一份备份（含数据与媒体的 zip），以后随时可重新导入。

---

## 切换 provider

快速开始用的是百炼，但主 provider 是可插拔的。改 `AI_PROVIDER` 并填对应的 Key：

| Provider | `AI_PROVIDER` | Key 环境变量 | 内置能力 |
|---|---|---|---|
| 阿里云百炼（Qwen） | `bailian` | `DASHSCOPE_API_KEY` | 视觉 · 标题 · 嵌入 |
| OpenAI | `openai` | `OPENAI_API_KEY` | 视觉 · 标题 · 嵌入 · 转写 |
| Gemini | `gemini` | `GEMINI_API_KEY` | 视觉 · 标题 · 嵌入 · 转写 |
| Claude | `claude` | `ANTHROPIC_API_KEY` | 视觉 · 标题 |
| 任意 OpenAI 兼容端点 | 在**设置**页添加 | — | Ollama / DeepSeek / OpenRouter… |

三个 AI 角色相互独立——`AI_PROVIDER`（视觉 + 标题）、`EMBEDDING_PROVIDER`、`TRANSCRIBE_PROVIDER`——所以可以混搭（比如百炼做视觉、OpenAI 做转写）。把某个角色设成 `same` 即跟随主 provider；主 provider 不具备该能力时会回退到 OpenAI。模型 ID 全部可手填，代码不做白名单校验——上架新模型后直接改 `.env` 即可用。

**百炼地域 Base URL**（`DASHSCOPE_BASE_URL`）：
- 华北2（北京）：`https://dashscope.aliyuncs.com/compatible-mode/v1`
- 新加坡：`https://dashscope-intl.aliyuncs.com/compatible-mode/v1`
- 美国（弗吉尼亚）：`https://dashscope-us.aliyuncs.com/compatible-mode/v1`

---

## 关于 embedding 维度

`entries_vec` 表的向量维度由**首次入库**的 embedding 模型决定（默认 `text-embedding-3-small` = 1536 维）。如果之后要换嵌入模型（如 Gemini = 768 维），可以在**设置**页用 **Reindex**（会用新模型重嵌全部已有条目），或者清空数据库重来：

```bash
rm backend/data/timemachine.db
```

---

## 范围之外（未来迭代）

- 自动截屏 / 麦克风常开（隐私敏感）
- 全局快捷键 / 菜单栏 App
- 多用户、云同步、加密
- 从其他 App 导入（Day One / Bear / Notion）；PDF 导出

---

## 开发

```bash
cd backend && uv sync --group dev
uv run pytest          # 后端测试
uv run ruff check .    # lint

cd ../frontend && npm run build   # 类型检查 + 构建
```

GitHub Actions 会在每次 push 和 PR 上跑后端测试与前端构建。也可以安装 pre-commit 钩子，在本地提交前跑同样的检查：

```bash
pre-commit install
```

---

## License

[MIT](./LICENSE)
