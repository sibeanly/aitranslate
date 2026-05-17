# LLM Translate

调用大模型 API 的 Chrome 浏览器翻译插件，支持双语对照展示网页内容。

## 功能

- **大模型驱动翻译**：支持 OpenAI 兼容 API（OpenAI、DeepSeek 或自定义端点），可接入任意模型
- **双语对照渲染**：原文下方展示译文，带左侧蓝色边框和浅灰背景
- **公式保护**：自动识别 arXiv/LaTeXML 等页面的数学公式 DOM 元素，翻译时原样保留公式渲染
- **思考内容过滤**：自动剥离 `<think>` 标签和模型推理内容
- **翻译缓存**：基于 SHA-256 的去重缓存，7 天有效期，LRU 淘汰（上限 1000 条）
- **并发控制**：3 路并发翻译，渐进式渲染
- **翻译范围选择**：支持"仅主体内容"（自动识别 `<article>` / `<main>`）和"全页翻译"
- **多语言**：支持中文简体/繁体、日文、韩文、英文、法文、德文

## 架构

```
┌─────────────────────────────────────────────┐
│  Chrome Extension (Manifest V3)             │
│                                             │
│  ┌─────────────┐    ┌──────────────────┐    │
│  │  Popup      │    │  Background      │    │
│  │  (设置页面)  │───▶│  (Service Worker)│    │
│  │             │    │  - API 代理      │    │
│  └─────────────┘    │  - 翻译缓存      │    │
│                     │  - 公式保护      │    │
│                     └────────┬─────────┘    │
│                              │              │
│                     ┌────────▼─────────┐    │
│                     │  Content Script  │    │
│                     │  - DOM 提取      │    │
│                     │  - 公式分块      │    │
│                     │  - 结构化渲染    │    │
│                     └──────────────────┘    │
└─────────────────────────────────────────────┘
```

| 模块 | 文件 | 职责 |
|------|------|------|
| Background | `src/background/service-worker.js` | API 代理、翻译缓存、公式文本保护、思考内容过滤 |
| Extractor | `src/content/extractor.js` | DOM 文本提取、主内容识别、公式 DOM 分块 |
| Translator | `src/content/translator.js` | 翻译编排、并发控制、文本/公式重组 |
| Renderer | `src/content/renderer.js` | 双语对照渲染、公式 DOM 克隆、错误展示 |
| Popup | `src/popup/popup.*` | 设置页面、连接测试 |

## 安装

1. 克隆仓库：
   ```bash
   git clone https://github.com/sibeanly/aitranslate.git
   ```

2. 打开 Chrome，进入 `chrome://extensions/`

3. 开启右上角「开发者模式」

4. 点击「加载已解压的扩展程序」，选择 `src/` 目录

## 配置

点击浏览器工具栏的插件图标，在弹出窗口中配置：

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| API Key | 大模型 API 密钥 | （空） |
| API 提供商 | OpenAI / DeepSeek / 自定义 | OpenAI |
| API 端点 | 兼容 OpenAI 格式的端点 URL | `https://api.openai.com/v1/chat/completions` |
| 模型名称 | 模型 ID | `gpt-4o-mini` |
| 目标语言 | 翻译目标语言 | 中文简体 |
| 翻译范围 | 仅主体内容 / 全页翻译 | 仅主体内容 |

配置完 API Key 后，可点击「测试连接」按钮验证连通性。

## 使用

1. 打开任意网页
2. 点击插件图标
3. 点击「翻译当前页面」
4. 译文以双语对照形式展示在原文下方
5. 点击「还原」移除所有译文

> **注意**：`chrome://` 和 `chrome-extension://` 页面不支持翻译。

## 公式翻译原理

对于含数学公式的页面（如 arXiv HTML），插件不是把公式压成纯文本发给 API，而是：

1. **提取阶段**：遍历 DOM，在 `mjx-container`、`.katex`、`.ltx_Math` 等公式元素边界处将内容切分为普通文本块和公式块
2. **翻译阶段**：仅将普通文本块发送给大模型，公式 DOM 节点完全隔离
3. **渲染阶段**：克隆原始公式 DOM 节点插入译文，并在文本与公式之间自动补充可读间隔

这样 arXiv/LaTeXML 原有的 MathML 和公式样式被完整保留。

## 开发

```bash
# 安装依赖
npm install

# 运行测试
npm test
```

### 项目结构

```
src/
├── manifest.json              # Manifest V3 配置
├── background/
│   └── service-worker.js      # API 代理、缓存、公式保护
├── content/
│   ├── index.js               # 消息监听入口
│   ├── extractor.js           # DOM 提取、公式分块
│   ├── translator.js          # 翻译编排
│   └── renderer.js            # 结构化渲染
├── popup/
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── styles/
│   └── content.css            # 双语对照注入样式
└── assets/                    # 插件图标
```

## 许可

MIT
