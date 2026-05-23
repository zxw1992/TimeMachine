# AI 时光机 (AITimeMachine)

> English: [README.md](./README.md)

把**看到的（图片/截图）**、**听到的（录音）**、**想到的（文字）**随手丢进时光机，AI 自动整理成带时间戳的条目，并支持自然语言模糊检索。

- 平台：macOS（本地 Web 应用，浏览器访问 `localhost:5173`）
- 后端：Python 3.11 + FastAPI
- 存储：SQLite + sqlite-vec（本地向量检索）
- AI：Claude / OpenAI / Gemini / 阿里云百炼（Qwen）可切换
- 前端：Vite + React + Tailwind + 自绘时间轴

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

```bash
./scripts/start.sh
```

- 后端：http://127.0.0.1:8000
- 前端：http://localhost:5173

---

## 使用

打开 http://localhost:5173

- **录入**：选择文字 / 图片 / 录音 → 输入或上传 → "保存到时光机"。
  - 图片：支持 ⌘V 直接粘贴截图
  - 录音：浏览器麦克风（首次会询问权限）
- **时间线**：在 vis-timeline 上浏览，点节点查看详情。可切换今天/本周/本月/全部。
- **检索**：用自然语言描述（"上次会议提到的客户名字"、"那张菜单上的招牌菜"），返回按语义相似度排序的命中。

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

`entries_vec` 表的向量维度由**首次入库**的 embedding 模型决定（默认 `text-embedding-3-small` = 1536 维）。如果之后切换 provider（如 Gemini = 768 维），需要：

```bash
rm backend/data/timemachine.db
```

清空重来，或者写一个 reindex 脚本（暂未提供）。

---

## 范围之外（未来迭代）

- 自动截屏 / 麦克风常开（隐私敏感）
- 全局快捷键 / 菜单栏 App
- 标签、收藏、编辑
- 多用户、云同步、加密
- 月/年回顾报告（AI 生成）

---

## License

[MIT](./LICENSE)
