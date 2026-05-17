# LLM Translate — 浏览器翻译插件设计文档

## 概述

构建一个 Chrome 浏览器扩展，调用大模型 API（OpenAI 兼容格式 / 自定义端点）将网页内容翻译成中文（或用户指定的目标语言），以双语对照方式展示。类似沉浸式翻译（Immersive Translate）的核心体验。

## 核心需求

- **LLM API**：支持自定义 API 端点（兼容 OpenAI `/v1/chat/completions` 格式），可接入任何模型
- **翻译展示**：双语对照模式，原文下方显示译文
- **浏览器**：仅支持 Chrome（Manifest V3）
- **触发方式**：点击插件图标翻译当前页面
- **翻译范围**：支持"仅主体内容"和"全页"两种模式，用户可切换
- **设置页面**：Popup 中配置 API 端点、Key、模型、目标语言、翻译范围

## 架构

### 方案：Content Script 主导

Content Script 负责所有 DOM 操作和翻译编排，Background Script 仅作为 API 请求代理（绕过 CORS）和缓存层。

```
┌─────────────────────────────────────────────┐
│  Chrome Extension (Manifest V3)             │
│                                             │
│  ┌─────────────┐    ┌──────────────────┐    │
│  │  Popup      │    │  Background      │    │
│  │  (设置页面)  │───▶│  (Service Worker)│    │
│  │             │    │  - API 代理      │    │
│  └─────────────┘    │  - 翻译缓存      │    │
│                     └────────┬─────────┘    │
│                              │              │
│                     ┌────────▼─────────┐    │
│                     │  Content Script  │    │
│                     │  - DOM 提取      │    │
│                     │  - 分段翻译      │    │
│                     │  - 双语对照渲染   │    │
│                     └──────────────────┘    │
└─────────────────────────────────────────────┘
```

选择理由：
- Content Script 直接操作 DOM，延迟最低
- Background 仅做轻量代理，消息传递简单
- 架构清晰，调试方便

## 模块设计

### 1. Content Script

#### DOM 提取

- 遍历页面 DOM，收集所有包含文本的叶子节点
- 目标标签：`p`, `span`, `h1`-`h6`, `li`, `td`, `a`, `div`（仅含直接文本）
- 跳过标签：`script`, `style`, `code`, `pre`, `noscript`, `textarea`, `svg`
- 已翻译节点（带 `data-translated="true"` 属性）跳过

#### 主内容识别（"仅主体内容"模式）

启发式规则选取主内容区域：
1. 优先查找 `<article>` 或 `<main>` 标签
2. 若无，选取文本密度最高的块级容器（字符数 / 标签数比率最大）
3. 排除 `<nav>`, `<header>`, `<footer>`, `<aside>` 区域

#### 智能分段

- 将相邻的内联文本节点合并为一段（保持语义完整）
- 每段控制在 500-1000 字符以内
- 合并时保留 HTML 结构映射，翻译后能正确回填到各节点

#### 双语对照渲染

- 翻译完成后，在每个原文节点的父元素内，原文后插入译文容器
- 译文容器结构：
  ```html
  <div class="llm-translate-bilingual" data-translated="true">
    <span class="llm-translate-target">译文内容</span>
  </div>
  ```
- 默认样式：浅灰背景、左侧蓝色边框、缩进、字号略小
- 注入独立 CSS 文件，用户可通过自定义 CSS 覆盖样式

#### 翻译流程

1. 用户点击图标 → Popup 发消息给 Content Script
2. Content Script 收集可翻译文本段（根据当前翻译范围设置）
3. Content Script 逐段发送 `translate` 消息给 Background
4. Background 调用 LLM API，返回译文
5. Content Script 将译文插入 DOM，形成双语对照
6. 翻译完成后更新图标状态

#### 还原功能

- 点击"还原"按钮时，删除所有 `.llm-translate-bilingual` 节点
- 恢复页面原始状态

### 2. Background Script (Service Worker)

#### API 代理

- 监听 `translate` 消息
- 构造 OpenAI 兼容请求：
  ```
  POST {apiEndpoint}
  Headers: Authorization: Bearer {apiKey}
  Body: {
    model: "{modelName}",
    messages: [
      { role: "system", content: "你是一个专业翻译..." },
      { role: "user", content: "待翻译文本" }
    ],
    temperature: 0.3
  }
  ```
- 支持流式响应（SSE），逐步返回译文（提升用户体验）
- 错误处理：API Key 无效、网络错误、配额超限等，返回友好错误消息

#### 翻译 Prompt

系统提示词：
```
你是一个专业翻译引擎。将以下文本翻译成{目标语言}。规则：
1. 只返回译文，不要添加任何解释或注释
2. 保持原文的段落结构和格式
3. 专有名词和代码保持不变
4. 如果原文已经是目标语言，直接返回原文
```

#### 翻译缓存

- 存储位置：`chrome.storage.local`
- Key：`SHA-256(原文 + 目标语言 + 模型名称)` 前 16 位
- Value：`{ translated: "译文", timestamp: 1715923200000 }`
- 缓存有效期：7 天
- 缓存上限：1000 条，LRU 淘汰

### 3. Popup

#### 配置项

| 配置 | 类型 | 默认值 | 存储 |
|------|------|--------|------|
| API 端点 URL | text | `https://api.openai.com/v1/chat/completions` | sync |
| API Key | password | 空 | sync |
| 模型名称 | text | `gpt-4o-mini` | sync |
| 目标语言 | select | 中文简体 | sync |
| 翻译范围 | radio | 仅主体内容 | sync |

#### 操作按钮

- **翻译当前页面**：发送消息给当前 tab 的 content script，触发翻译
- **还原页面**：移除所有译文节点，恢复原文显示
- 翻译进行中显示 loading 状态

#### 存储

- 配置使用 `chrome.storage.sync`，跨设备同步
- 翻译缓存使用 `chrome.storage.local`，仅本地

## 文件结构

```
src/
├── manifest.json              # Manifest V3 配置
├── background/
│   └── service-worker.js      # API 代理 + 缓存
├── content/
│   ├── index.js               # 入口，消息监听
│   ├── extractor.js           # DOM 文本提取 + 分段
│   ├── translator.js          # 翻译编排（调用 background）
│   └── renderer.js            # 双语对照渲染 + 还原
├── popup/
│   ├── popup.html             # 设置页面 HTML
│   ├── popup.js               # 设置页面逻辑
│   └── popup.css              # 设置页面样式
├── assets/
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
└── styles/
    └── content.css            # 双语对照注入样式
```

## 错误处理

- **API Key 未配置**：Popup 中显示红色提示，翻译按钮禁用
- **API 调用失败**：Content Script 在译文位置显示错误提示（非 alert），用户可重试
- **网络错误**：显示"网络连接失败，请检查网络后重试"
- **配额超限**：显示"API 配额已用完，请稍后再试"
- **页面不可翻译**（chrome:// 页面等）：优雅降级，提示用户

## 性能考量

- **并行翻译**：多个文本段可并行请求（但限制并发数为 3，避免 API 限流）
- **渐进式渲染**：每段翻译完成后立即插入 DOM，不等所有段完成
- **缓存命中**：先查缓存，命中则直接渲染，跳过 API 调用
- **最小 DOM 操作**：使用 DocumentFragment 批量插入节点
