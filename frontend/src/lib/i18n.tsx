import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Lang = "zh" | "en";

const KEY = "aitm-lang";

type Dict = Record<string, string>;

const zh: Dict = {
  // Brand / nav
  "brand": "时光机",
  "nav.capture": "记录",
  "nav.timeline": "时光",
  "nav.search": "回溯",
  "nav.review": "回顾",
  "nav.settings": "设置",
  "nav.github": "在 GitHub 查看源码",

  // Review page
  "review.title": "回顾",
  "review.kind.week": "周",
  "review.kind.month": "月",
  "review.prev": "上一段",
  "review.next": "下一段",
  "review.rel.week.0": "本周",
  "review.rel.week.1": "上周",
  "review.rel.month.0": "本月",
  "review.rel.month.1": "上月",
  "review.loading": "汲取中…",
  "review.loadError": "加载失败",
  "review.empty.title": "这段时间还没有记忆。",
  "review.empty.hint": "先去“记录”页留下点什么，回来再回顾。",
  "review.memories": "条记忆",
  "review.cta": "让 AI 把这段时间的记忆汇成一篇回顾。",
  "review.generate": "生成 AI 回顾",
  "review.generating": "AI 正在回顾…",
  "review.generatingHint": "正在阅读这段时间的记忆并撰写，请稍候…",
  "review.regenerate": "重新生成",
  "review.genError": "生成失败，请重试",
  "review.generatedAt": "生成于 {time}",
  "review.daily": "每日活跃",
  "review.topTags": "热门标签",
  "review.stat.total": "共 {n} 条",
  "review.stat.text": "文字 {n}",
  "review.stat.image": "图片 {n}",
  "review.stat.audio": "语音 {n}",

  // Settings page
  "settings.title": "设置",
  "settings.subtitle": "在这里配置 AI 供应商、模型和密钥，无需改文件重启。",
  "settings.section.roles": "角色分工",
  "settings.suggestTags.label": "AI 自动建议标签",
  "settings.suggestTags.hint": "录入处理时让 AI 给出候选标签（每条多一次轻量调用，仍需你一键采纳）。关闭可省成本。",
  "settings.section.builtin": "内置供应商",
  "settings.section.custom": "自定义供应商",
  "settings.section.appearance": "外观",
  "settings.section.data": "数据",
  "settings.data.exportHint": "把你的全部记忆随时拿出来。备份含数据与媒体文件，可重新导入还原。",
  "settings.data.exportBackup": "下载完整备份 (.zip)",
  "settings.data.exportMarkdown": "导出 Markdown (.zip)",
  "settings.data.importHint": "从备份 zip 还原。导入为追加式，重复条目（同时间+内容）会自动跳过。",
  "settings.data.importBtn": "选择备份文件导入",
  "settings.data.importing": "导入中…",
  "settings.data.importDone": "已导入 {imported} 条，跳过 {skipped} 条重复。",
  "settings.data.importRefresh": "刷新页面即可看到。",
  "settings.section.about": "关于",
  "settings.role.primary": "主模型（图像描述 + 标题）",
  "settings.role.embedding": "向量嵌入",
  "settings.role.transcribe": "语音转写",
  "settings.role.same": "跟随主模型",
  "settings.cap.vision": "图像",
  "settings.cap.title": "标题",
  "settings.cap.embed": "嵌入",
  "settings.cap.transcribe": "转写",
  "settings.apiKey": "API Key",
  "settings.apiKey.set": "已设置（留空则不改）",
  "settings.apiKey.unset": "未设置",
  "settings.save": "保存设置",
  "settings.saved": "已保存",
  "settings.saving": "保存中…",
  "settings.test": "测试连接",
  "settings.testing": "测试中…",
  "settings.test.ok": "可用",
  "settings.test.fail": "失败",
  "settings.embedding.locked": "已有 {count} 条记忆，嵌入维度锁定为 {dim}。更换嵌入模型需要重建索引。",
  "settings.embedding.reindexBtn": "更换嵌入模型并重建索引",
  "settings.embedding.reindexHint": "将用新模型重新嵌入全部 {count} 条记忆（可能产生 API 费用并耗时）。",
  "settings.embedding.reindexConfirm": "确定用所选模型重建索引？过程中请勿关闭。",
  "settings.embedding.reindexing": "重建索引中…",
  "settings.embedding.reindexDone": "重建完成：{count} 条 · 维度 {dim}",
  "settings.custom.add": "添加自定义供应商",
  "settings.custom.id": "ID（唯一标识，用于选择）",
  "settings.custom.label": "显示名称",
  "settings.custom.baseUrl": "Base URL（OpenAI 兼容）",
  "settings.custom.textModel": "文本模型",
  "settings.custom.visionModel": "视觉模型",
  "settings.custom.embeddingModel": "嵌入模型",
  "settings.custom.embeddingDim": "嵌入维度",
  "settings.custom.transcribeModel": "转写模型",
  "settings.custom.caps": "支持的能力",
  "settings.custom.remove": "删除",
  "settings.custom.empty": "还没有自定义供应商。任何 OpenAI 兼容服务（Ollama / DeepSeek / OpenRouter 等）都可以加进来。",
  "settings.loadError": "加载设置失败。",

  // Theme toggle
  "theme.light": "明",
  "theme.dark": "暗",
  "theme.system": "随系统",
  "theme.title": "主题：{label}（点击切换）",
  "theme.aria": "切换主题",

  // Language toggle
  "lang.title": "语言：{label}（点击切换）",
  "lang.aria": "切换语言",
  "lang.zh": "中文",
  "lang.en": "EN",

  // Kinds
  "kind.text": "文字",
  "kind.image": "影像",
  "kind.audio": "声音",
  "kind.link": "链接",
  "kind.glyph.text": "文",
  "kind.glyph.image": "影",
  "kind.glyph.audio": "声",
  "kind.glyph.link": "链",

  // Capture page
  "capture.title": "此刻",
  "capture.subtitle": "把看到的、听到的、想到的，丢进时光机。",
  "capture.mode.text": "想到的",
  "capture.mode.image": "看到的",
  "capture.mode.audio": "听到的",
  "capture.mode.link": "读到的",
  "capture.text.placeholder": "此刻在想什么…",
  "capture.link.placeholder": "粘贴网页链接，AI 会解析正文并记录下来",
  "capture.link.note": "可选：为什么想存它 / 你的批注",
  "capture.link.hint": "适合文章、博客、新闻；英文网页也会自动生成中文摘要。付费墙或需登录的页面可能抓取不到。",
  "capture.image.drop": "选择或拖入一张图",
  "capture.image.paste": "⌘V 也可以直接粘贴截图",
  "capture.image.hint": "可选：补充上下文（在哪儿看到的）",
  "capture.image.note": "可选：你自己的批注",
  "capture.image.replace": "换一张",
  "capture.image.removeOne": "移除这张",
  "capture.image.batchHint": "这 {n} 张图将合并为一条记忆",
  "entry.imageCount": "{n} 张图",
  "capture.audio.note": "可选：你的批注",
  "capture.audio.start": "开始录音",
  "capture.audio.stop": "停止录音",
  "capture.audio.micError": "无法访问麦克风：{msg}",
  "capture.submitting": "提交中…",
  "capture.footerHint": "保存后会自动生成标题与描述",
  "capture.submit": "存入时光机",
  "capture.processing": "正在整理",
  "capture.stage.queued": "排队中",
  "capture.stage.describing": "识别图片",
  "capture.stage.transcribing": "转写语音",
  "capture.stage.fetching": "抓取网页",
  "capture.stage.summarizing": "提炼正文",
  "capture.stage.titling": "生成标题",
  "capture.stage.embedding": "建立索引",
  "capture.stage.done": "完成",
  "capture.stage.error": "处理失败",
  "capture.done.toast": "已存入时光机",
  "capture.dismiss": "知道了",
  "capture.recent": "最近",
  "capture.customTime.toggle": "自定义时间",
  "capture.customTime.label": "发生于",
  "capture.customTime.clear": "用当前时间",
  "onThisDay.title": "那年今日",
  "onThisDay.yearAgo": "去年的今天",
  "onThisDay.yearsAgo": "{n} 年前的今天",

  // First-run onboarding
  "onboard.title": "欢迎来到时光机",
  "onboard.subtitle": "两步就能开始记录。",
  "onboard.dismiss": "跳过引导",
  "onboard.step1.title": "填入 AI 的 API Key",
  "onboard.step1.desc": "时光机用 AI 自动生成标题、描述和检索索引。先到设置里配置一个供应商。",
  "onboard.step1.cta": "去设置",
  "onboard.step1.done": "已配置密钥",
  "onboard.step2.title": "记下第一条",
  "onboard.step2.desc": "在下面写一句此刻在想的事，存进时光机试试。",

  // Timeline page
  "timeline.title": "时间之河",
  "timeline.range.today": "今日",
  "timeline.range.week": "本周",
  "timeline.range.month": "本月",
  "timeline.range.all": "全部",
  "timeline.loading": "汲取中…",
  "timeline.count": "{n} 条记忆",
  "timeline.empty.title": "这段时间还没有记忆。",
  "timeline.empty.hint": "去“记录”页留下点什么吧。",
  "timeline.filter.favorites": "仅收藏",
  "timeline.filter.allTags": "全部标签",
  "timeline.filter.clear": "清除筛选",
  "timeline.processing": "整理中…",
  "timeline.failed": "处理失败",

  // Calendar heatmap
  "heatmap.title": "月度鸟瞰",
  "heatmap.summary": "近 {months} 个月 · {total} 条",
  "heatmap.expand": "展开",
  "heatmap.collapse": "收起",
  "heatmap.tip.has": "{n} 条记忆",
  "heatmap.tip.none": "无记录",
  "heatmap.monthLabel": "{year}·{month}月",

  // Entry drawer
  "drawer.close": "关闭",
  "drawer.prev": "上一条",
  "drawer.next": "下一条",
  "drawer.prevTitle": "上一条 (←)",
  "drawer.nextTitle": "下一条 (→)",
  "drawer.confirmDelete": "确认删除这条记忆？",
  "drawer.loading": "汲取中…",
  "drawer.savedAt": "写入于 {time}",
  "drawer.delete": "删除这条记忆",
  "drawer.edit": "编辑",
  "drawer.save": "保存",
  "drawer.cancel": "取消",
  "drawer.saving": "保存中…",
  "drawer.titleLabel": "标题",
  "drawer.titlePlaceholder": "（留空则无标题）",
  "drawer.bodyLabel": "正文",
  "drawer.timeLabel": "发生时间",
  "drawer.editError": "保存失败，请重试",
  "drawer.favorite": "收藏",
  "drawer.unfavorite": "取消收藏",
  "drawer.tagsLabel": "标签",
  "drawer.suggestedLabel": "建议",

  // Tags
  "tags.label": "标签",
  "tags.placeholder": "加标签，回车确认",
  "tags.remove": "移除 {tag}",

  // River entry (shared list item)
  "entry.match": "· 相似 {pct}%",
  "entry.expand": "展开",
  "entry.collapse": "收起",
  "entry.locate": "在时间轴查看",
  "entry.delete": "删除",
  "entry.link.open": "查看原文 ↗",

  // Audio player
  "audio.play": "播放",
  "audio.pause": "暂停",

  // Search page
  "search.title": "回溯",
  "search.subtitle": "用一句话描述你想找回的那段记忆。",
  "search.placeholder": "比如：那次会议里提到的那个名字…",
  "search.searching": "检索中…",
  "search.enterHint": "回车开始",
  "search.submit": "找一找",
  "search.suggestionsTitle": "没有头绪？试试：",
  "search.suggestion.1": "那次开会聊到的客户名字",
  "search.suggestion.2": "上周看到的一张菜单截图",
  "search.suggestion.3": "某天心情不太好时写的话",
  "search.suggestion.4": "提到「番茄」的那段录音",
  "search.history.title": "最近搜索",
  "search.history.clear": "清空",
  "search.history.expand": "展开全部 ({n})",
  "search.history.collapse": "收起",
  "search.history.deleteAria": "删除「{q}」",
  "search.history.deleteTitle": "删除这条历史",
  "search.empty.title": "没有匹配的记忆。",
  "search.empty.hint": "换个描述试试，AI 会按语义匹配。",
  "search.found": "找到 {n} 条相关记忆",

  // Friendly errors
  "error.network": "连不上服务，请确认后端正在运行后重试。",
  "error.noKey": "还没有配置 {provider} 的 API Key，请先到设置里填写。",
  "error.auth": "API Key 无效或权限不足，请到设置里检查。",
  "error.customConfig": "自定义供应商配置不完整（缺少 Base URL），请到设置里补全。",
  "error.rateLimit": "请求太频繁了，稍等片刻再试。",
  "error.timeout": "请求超时了，请重试。",
  "error.server": "服务出错了，请稍后重试。",
  "error.generic": "出错了：{msg}",
  "error.retry": "重试",
  "error.toSettings": "去设置",
};

const en: Dict = {
  // Brand / nav
  "brand": "Time Machine",
  "nav.capture": "Capture",
  "nav.timeline": "Timeline",
  "nav.search": "Recall",
  "nav.review": "Review",
  "nav.settings": "Settings",
  "nav.github": "View source on GitHub",

  // Review page
  "review.title": "Review",
  "review.kind.week": "Weekly",
  "review.kind.month": "Monthly",
  "review.prev": "Previous period",
  "review.next": "Next period",
  "review.rel.week.0": "This week",
  "review.rel.week.1": "Last week",
  "review.rel.month.0": "This month",
  "review.rel.month.1": "Last month",
  "review.loading": "Loading…",
  "review.loadError": "Failed to load",
  "review.empty.title": "No memories in this period.",
  "review.empty.hint": "Capture something first, then come back to review.",
  "review.memories": "memories",
  "review.cta": "Let AI weave this period's memories into a review.",
  "review.generate": "Generate AI review",
  "review.generating": "AI is reviewing…",
  "review.generatingHint": "Reading this period's memories and writing — hang tight…",
  "review.regenerate": "Regenerate",
  "review.genError": "Generation failed, please retry",
  "review.generatedAt": "Generated {time}",
  "review.daily": "Daily activity",
  "review.topTags": "Top tags",
  "review.stat.total": "{n} total",
  "review.stat.text": "{n} text",
  "review.stat.image": "{n} image",
  "review.stat.audio": "{n} audio",

  // Settings page
  "settings.title": "Settings",
  "settings.subtitle": "Configure AI providers, models, and keys here — no file editing or restart.",
  "settings.section.roles": "Roles",
  "settings.suggestTags.label": "AI tag suggestions",
  "settings.suggestTags.hint": "Let the AI propose tags while processing a capture (one extra lightweight call per entry; you still accept them with a click). Turn off to save cost.",
  "settings.section.builtin": "Built-in providers",
  "settings.section.custom": "Custom providers",
  "settings.section.appearance": "Appearance",
  "settings.section.data": "Data",
  "settings.data.exportHint": "Take all your memories with you anytime. A backup includes your data and media files, and can be re-imported to restore.",
  "settings.data.exportBackup": "Download full backup (.zip)",
  "settings.data.exportMarkdown": "Export Markdown (.zip)",
  "settings.data.importHint": "Restore from a backup zip. Import is additive; duplicates (same time + content) are skipped automatically.",
  "settings.data.importBtn": "Choose a backup to import",
  "settings.data.importing": "Importing…",
  "settings.data.importDone": "Imported {imported}, skipped {skipped} duplicates.",
  "settings.data.importRefresh": "Refresh to see them.",
  "settings.section.about": "About",
  "settings.role.primary": "Primary (image description + titles)",
  "settings.role.embedding": "Embeddings",
  "settings.role.transcribe": "Transcription",
  "settings.role.same": "Same as primary",
  "settings.cap.vision": "Vision",
  "settings.cap.title": "Title",
  "settings.cap.embed": "Embed",
  "settings.cap.transcribe": "Transcribe",
  "settings.apiKey": "API key",
  "settings.apiKey.set": "Set (leave blank to keep)",
  "settings.apiKey.unset": "Not set",
  "settings.save": "Save settings",
  "settings.saved": "Saved",
  "settings.saving": "Saving…",
  "settings.test": "Test connection",
  "settings.testing": "Testing…",
  "settings.test.ok": "OK",
  "settings.test.fail": "Failed",
  "settings.embedding.locked": "{count} memories exist; embedding dim is locked at {dim}. Changing the embedding model requires a reindex.",
  "settings.embedding.reindexBtn": "Switch embedding model & reindex",
  "settings.embedding.reindexHint": "Re-embeds all {count} memories with the new model (may incur API cost and take a while).",
  "settings.embedding.reindexConfirm": "Reindex with the selected model? Don't close while it runs.",
  "settings.embedding.reindexing": "Reindexing…",
  "settings.embedding.reindexDone": "Reindexed {count} memories · dim {dim}",
  "settings.custom.add": "Add custom provider",
  "settings.custom.id": "ID (unique, used to select it)",
  "settings.custom.label": "Display name",
  "settings.custom.baseUrl": "Base URL (OpenAI-compatible)",
  "settings.custom.textModel": "Text model",
  "settings.custom.visionModel": "Vision model",
  "settings.custom.embeddingModel": "Embedding model",
  "settings.custom.embeddingDim": "Embedding dim",
  "settings.custom.transcribeModel": "Transcribe model",
  "settings.custom.caps": "Capabilities",
  "settings.custom.remove": "Remove",
  "settings.custom.empty": "No custom providers yet. Any OpenAI-compatible service (Ollama / DeepSeek / OpenRouter, …) can be added here.",
  "settings.loadError": "Failed to load settings.",

  // Theme toggle
  "theme.light": "Light",
  "theme.dark": "Dark",
  "theme.system": "System",
  "theme.title": "Theme: {label} (click to cycle)",
  "theme.aria": "Toggle theme",

  // Language toggle
  "lang.title": "Language: {label} (click to switch)",
  "lang.aria": "Switch language",
  "lang.zh": "中文",
  "lang.en": "EN",

  // Kinds
  "kind.text": "Text",
  "kind.image": "Image",
  "kind.audio": "Audio",
  "kind.link": "Link",
  "kind.glyph.text": "T",
  "kind.glyph.image": "I",
  "kind.glyph.audio": "A",
  "kind.glyph.link": "L",

  // Capture page
  "capture.title": "Now",
  "capture.subtitle": "Drop what you see, hear, and think into the time machine.",
  "capture.mode.text": "Thought",
  "capture.mode.image": "Saw",
  "capture.mode.audio": "Heard",
  "capture.mode.link": "Read",
  "capture.text.placeholder": "What's on your mind…",
  "capture.link.placeholder": "Paste a web link — AI reads the article and records it",
  "capture.link.note": "Optional: why you're saving it / your note",
  "capture.link.hint": "Great for articles, blogs, and news; the summary is written in your app language. Paywalled or login-gated pages may not be fetchable.",
  "capture.image.drop": "Choose or drag in an image",
  "capture.image.paste": "⌘V also pastes a screenshot directly",
  "capture.image.hint": "Optional: add context (where you saw it)",
  "capture.image.note": "Optional: your own note",
  "capture.image.replace": "Replace",
  "capture.image.removeOne": "Remove this image",
  "capture.image.batchHint": "These {n} images will be merged into one memory",
  "entry.imageCount": "{n} images",
  "capture.audio.note": "Optional: your note",
  "capture.audio.start": "Start recording",
  "capture.audio.stop": "Stop recording",
  "capture.audio.micError": "Cannot access microphone: {msg}",
  "capture.submitting": "Submitting…",
  "capture.footerHint": "A title and description are generated automatically on save",
  "capture.submit": "Save to Time Machine",
  "capture.processing": "Processing",
  "capture.stage.queued": "Queued",
  "capture.stage.describing": "Reading image",
  "capture.stage.transcribing": "Transcribing",
  "capture.stage.fetching": "Fetching",
  "capture.stage.summarizing": "Summarizing",
  "capture.stage.titling": "Writing title",
  "capture.stage.embedding": "Indexing",
  "capture.stage.done": "Done",
  "capture.stage.error": "Failed",
  "capture.done.toast": "Saved to your timeline",
  "capture.dismiss": "Dismiss",
  "capture.recent": "Recent",
  "capture.customTime.toggle": "Custom time",
  "capture.customTime.label": "Happened at",
  "capture.customTime.clear": "Use now",
  "onThisDay.title": "On this day",
  "onThisDay.yearAgo": "A year ago today",
  "onThisDay.yearsAgo": "{n} years ago today",

  // First-run onboarding
  "onboard.title": "Welcome to Time Machine",
  "onboard.subtitle": "Two steps to start capturing.",
  "onboard.dismiss": "Skip",
  "onboard.step1.title": "Add an AI API key",
  "onboard.step1.desc": "Time Machine uses AI to auto-generate titles, descriptions, and the search index. Configure a provider in Settings first.",
  "onboard.step1.cta": "Open Settings",
  "onboard.step1.done": "Key configured",
  "onboard.step2.title": "Capture your first memory",
  "onboard.step2.desc": "Write a line about what's on your mind below and save it to your timeline.",

  // Timeline page
  "timeline.title": "River of Time",
  "timeline.range.today": "Today",
  "timeline.range.week": "Week",
  "timeline.range.month": "Month",
  "timeline.range.all": "All",
  "timeline.loading": "Loading…",
  "timeline.count": "{n} memories",
  "timeline.empty.title": "No memories in this period yet.",
  "timeline.empty.hint": "Head to “Capture” and jot something down.",
  "timeline.filter.favorites": "Favorites",
  "timeline.filter.allTags": "All tags",
  "timeline.filter.clear": "Clear filters",
  "timeline.processing": "Processing…",
  "timeline.failed": "Failed",

  // Calendar heatmap
  "heatmap.title": "Monthly overview",
  "heatmap.summary": "Last {months} months · {total} total",
  "heatmap.expand": "Expand",
  "heatmap.collapse": "Collapse",
  "heatmap.tip.has": "{n} memories",
  "heatmap.tip.none": "No entries",
  "heatmap.monthLabel": "{month} {year}",

  // Entry drawer
  "drawer.close": "Close",
  "drawer.prev": "Previous",
  "drawer.next": "Next",
  "drawer.prevTitle": "Previous (←)",
  "drawer.nextTitle": "Next (→)",
  "drawer.confirmDelete": "Delete this memory?",
  "drawer.loading": "Loading…",
  "drawer.savedAt": "Saved {time}",
  "drawer.delete": "Delete this memory",
  "drawer.edit": "Edit",
  "drawer.save": "Save",
  "drawer.cancel": "Cancel",
  "drawer.saving": "Saving…",
  "drawer.titleLabel": "Title",
  "drawer.titlePlaceholder": "(leave empty for no title)",
  "drawer.bodyLabel": "Body",
  "drawer.timeLabel": "When it happened",
  "drawer.editError": "Save failed, please retry",
  "drawer.favorite": "Favorite",
  "drawer.unfavorite": "Unfavorite",
  "drawer.tagsLabel": "Tags",
  "drawer.suggestedLabel": "Suggested",

  // Tags
  "tags.label": "Tags",
  "tags.placeholder": "Add a tag, press Enter",
  "tags.remove": "Remove {tag}",

  // River entry (shared list item)
  "entry.match": "· {pct}% match",
  "entry.expand": "Expand",
  "entry.collapse": "Collapse",
  "entry.locate": "View on timeline",
  "entry.delete": "Delete",
  "entry.link.open": "View original ↗",

  // Audio player
  "audio.play": "Play",
  "audio.pause": "Pause",

  // Search page
  "search.title": "Recall",
  "search.subtitle": "Describe the memory you want to find in a sentence.",
  "search.placeholder": "e.g. the name mentioned in that meeting…",
  "search.searching": "Searching…",
  "search.enterHint": "Press Enter to start",
  "search.submit": "Search",
  "search.suggestionsTitle": "Not sure? Try:",
  "search.suggestion.1": "the client's name from that meeting",
  "search.suggestion.2": "a menu screenshot I saw last week",
  "search.suggestion.3": "something I wrote on a bad day",
  "search.suggestion.4": "the recording that mentions “tomato”",
  "search.history.title": "Recent searches",
  "search.history.clear": "Clear",
  "search.history.expand": "Show all ({n})",
  "search.history.collapse": "Collapse",
  "search.history.deleteAria": "Delete “{q}”",
  "search.history.deleteTitle": "Delete this entry",
  "search.empty.title": "No matching memories.",
  "search.empty.hint": "Try rephrasing — the AI matches by meaning.",
  "search.found": "Found {n} related memories",

  // Friendly errors
  "error.network": "Can't reach the server. Make sure the backend is running, then retry.",
  "error.noKey": "No API key configured for {provider}. Add one in Settings first.",
  "error.auth": "API key is invalid or lacks permission. Check it in Settings.",
  "error.customConfig": "Custom provider is incomplete (missing Base URL). Complete it in Settings.",
  "error.rateLimit": "Too many requests. Wait a moment and try again.",
  "error.timeout": "The request timed out. Please retry.",
  "error.server": "Something went wrong on the server. Please try again.",
  "error.generic": "Something went wrong: {msg}",
  "error.retry": "Retry",
  "error.toSettings": "Open Settings",
};

const dict: Record<Lang, Dict> = { zh, en };

function interpolate(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) =>
    k in vars ? String(vars[k]) : `{${k}}`,
  );
}

function detectDefault(): Lang {
  const stored = localStorage.getItem(KEY);
  if (stored === "zh" || stored === "en") return stored;
  return navigator.language?.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export type TFn = (key: string, vars?: Record<string, string | number>) => string;

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: TFn;
}

const Ctx = createContext<I18nCtx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(detectDefault);

  useEffect(() => {
    localStorage.setItem(KEY, lang);
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  }, [lang]);

  const value = useMemo<I18nCtx>(() => {
    const t: TFn = (key, vars) =>
      interpolate(dict[lang][key] ?? zh[key] ?? key, vars);
    return { lang, setLang, t };
  }, [lang]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useI18n must be used within I18nProvider");
  return c;
}
