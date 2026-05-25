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

至少需要 **OpenAI Key**（用于 Whisper 转写和 Embeddings），可选 Claude / Gemini 作为视觉/总结主 provider。

```bash
cd backend
cp .env.example .env
```

编辑 `backend/.env`，填入：

```env
AI_PROVIDER=claude            # 主 provider（图像描述 + 标题）
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...         # 必填：用于 Whisper + Embeddings
```

> 如果只用 OpenAI，把 `AI_PROVIDER` 改成 `openai`，Anthropic Key 留空即可。

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

- **录入**：选择文字 / 图片 / 录音 → 输入或上传 → "保存到时光机"。
  - 图片：支持 ⌘V 直接粘贴截图，也可**一次选多张**（每张各存一条）
  - 录音：浏览器麦克风（首次会询问权限）
  - 条目保存后立即入库，AI 在后台整理并显示分阶段进度；可选填**自定义时间**给记忆补一个发生时刻
  - 新用户有简短的上手引导，往年的记忆会在**"那年今日"**里浮现
- **时间线**：自绘的纵向"时间之河"按天分组，顶部有按月的**日历热力图**做鸟瞰；点标题在右侧抽屉看详情。可切换今天 / 本周 / 本月 / 全部。
- **检索**：用自然语言描述（"上次会议提到的客户名字"、"那张菜单上的招牌菜"），返回按语义相似度排序的命中。
- **设置**：在应用内切换 AI provider、填写密钥与模型，添加自定义 OpenAI 兼容 provider，切换语言与主题——即时生效、无需改文件或重启。

---

## 数据位置

所有数据都在 `backend/data/`：

```
data/
├── timemachine.db      # SQLite（含 entries / FTS / vec0）
└── uploads/YYYY/MM/    # 原始图片和音频；thumbs/ 是缩略图
```

备份就是直接拷走 `data/` 目录。

---

## 用阿里云百炼（Qwen）

百炼提供 OpenAI 兼容模式，所以共用 `openai` SDK，只换 base_url。`.env` 配置：

```env
AI_PROVIDER=bailian
DASHSCOPE_API_KEY=sk-...
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1   # 按地域改
DASHSCOPE_TEXT_MODEL=qwen-plus            # 也可填 qwen-max / qwen-turbo 等
DASHSCOPE_VISION_MODEL=qwen-vl-plus       # 或 qwen-vl-max / qwen2.5-vl-72b-instruct
DASHSCOPE_EMBEDDING_MODEL=text-embedding-v3
DASHSCOPE_EMBEDDING_DIM=1024              # 切换嵌入模型时务必同步

EMBEDDING_PROVIDER=same                   # 跟随主 provider（百炼）
TRANSCRIBE_PROVIDER=openai                # 百炼兼容模式不支持音频转写，回退 OpenAI 或 gemini
```

**地域 Base URL**：
- 华北2（北京）：`https://dashscope.aliyuncs.com/compatible-mode/v1`
- 新加坡：`https://dashscope-intl.aliyuncs.com/compatible-mode/v1`
- 美国（弗吉尼亚）：`https://dashscope-us.aliyuncs.com/compatible-mode/v1`

模型 ID 全部可手填，代码不做白名单校验——百炼上架新模型后直接改 `.env` 即可用。

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
- 标签、收藏、编辑
- 多用户、云同步、加密
- 月/年回顾报告（AI 生成）

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
