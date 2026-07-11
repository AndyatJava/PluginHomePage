# ModelFlow 插件开发指南（浏览器插件版）

> 目标读者：需要在独立编辑器/工具中开发 ModelFlow 浏览器插件的开发者  
> 本指南配套参考实现位于 `../browser-plugin/`

---

## 一、开始前

### 1.1 你需要什么

- 任意代码编辑器（VS Code、Cursor、JetBrains 等）
- Node.js 22+
- 对 MCP（Model Context Protocol）有基本了解
- 可选：本地安装 ModelFlow 桌面版用于调试

### 1.2 核心原则

- 插件是**自包含目录**：`manifest.json` + 代码 + 资源。
- 与 ModelFlow 核心通过 **MCP over stdio** 通信。
- 语言无关：可用 JS/TS、Python、Rust 等实现。
- 工具通过 MCP `tools/list` 动态发现，通过 `tools/call` 调用。
- 能力声明式注册：在 `manifest.json` 里声明 `permissions`、`menuEntries` 与 `windows`。

---

## 二、最小插件结构

```
my-browser-plugin/
├── manifest.json              # 必须，协议入口
├── dist/
│   └── index.js               # 插件入口（与 manifest.runtime 对应）
├── ui/                        # 可选：插件窗口内容
│   ├── index.html
│   ├── ui.ts
│   └── ui.css
├── sidecar/                   # 可选：本地 sidecar 资源
│   ├── node.exe
│   ├── src-playwright/
│   └── playwright-cache/
└── README.md
```

---

## 三、`manifest.json` 详解（浏览器插件版）

```json
{
  "manifestVersion": "0.1",
  "id": "com.modelflow.browser",
  "version": "1.1.0",
  "name": "浏览器自动化",
  "description": "驱动浏览器完成网页操作",
  "author": "Your Name",
  "runtime": {
    "command": "node",
    "args": ["dist/index.js"],
    "workingDir": ".",
    "requires": {
      "node": ">=20.0.0"
    },
    "devMode": true,
    "logLevel": "debug"
  },
  "windows": [
    {
      "windowId": "browser-main",
      "entry": "ui/index.html",
      "title": "浏览器控制面板",
      "defaultMode": "floating",
      "defaultWidth": 900,
      "defaultHeight": 700
    }
  ],
  "permissions": [
    { "type": "browser" },
    { "type": "network", "allowedHosts": ["*"] },
    { "type": "window" }
  ],
  "menuEntries": [
    {
      "label": "打开示例页",
      "action": "browser_navigate",
      "args": { "url": "https://example.com" },
      "section": "浏览器"
    }
  ],
  "settings": [
    {
      "key": "headless",
      "label": "无头模式",
      "type": "boolean",
      "description": "是否在无头模式下运行浏览器",
      "default": true
    },
    {
      "key": "defaultTimeout",
      "label": "默认超时（毫秒）",
      "type": "number",
      "default": 30000
    }
  ]
}
```

### 3.1 关键字段说明

| 字段 | 说明 |
|------|------|
| `id` | 全局唯一，反域名风格。例：`com.yourcompany.browser` |
| `runtime.command` / `runtime.args` | 启动插件进程的命令与参数 |
| `runtime.requires` | 运行环境要求，如 `node` 版本 |
| `runtime.devMode` | 开发模式，开启后核心会转发插件 `stderr` 日志 |
| `permissions` | 权限白名单，未声明的权限调用会被拒绝 |
| `windows` | 插件窗口声明，见八、插件窗口 |
| `menuEntries` | 注册到 ModelFlow 菜单的快捷入口 |
| `settings` | 在 Settings > 插件设置 中展示的可配置项，见 3.3 |

### 3.2 浏览器插件需要的权限

```json
"permissions": [
  { "type": "browser" },
  { "type": "network", "allowedHosts": ["*"] },
  { "type": "window" }
]
```

其中 `window` 权限允许插件创建和管理插件窗口。

### 3.3 `settings` 插件设置项

在 `manifest.json` 中声明 `settings` 后，ModelFlow 会在 **设置 > 插件设置** 页面为该插件展示配置表单。用户修改后的值会被持久化，并在插件下次启动时通过 MCP `initialize` 的 `params.settings` 传入。

```json
{
  "settings": [
    {
      "key": "apiUrl",
      "label": "API 地址",
      "type": "string",
      "description": "自定义后端地址",
      "default": "https://api.example.com",
      "required": true
    },
    {
      "key": "apiKey",
      "label": "API Key",
      "type": "password",
      "required": true
    },
    {
      "key": "timeout",
      "label": "超时时间（秒）",
      "type": "number",
      "default": 30
    },
    {
      "key": "autoStart",
      "label": "自动启动",
      "type": "boolean",
      "default": false
    },
    {
      "key": "mode",
      "label": "运行模式",
      "type": "select",
      "default": "standard",
      "options": [
        { "label": "标准", "value": "standard" },
        { "label": "高性能", "value": "performance" }
      ]
    }
  ]
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `key` | string | 是 | 设置项标识，插件内唯一 |
| `label` | string | 是 | 显示名称 |
| `type` | string | 是 | `string` / `number` / `boolean` / `select` / `password` |
| `description` | string | 否 | 提示说明 |
| `default` | any | 否 | 默认值 |
| `required` | boolean | 否 | 是否必填 |
| `options` | array | 否 | `select` 类型选项，`{ label, value }` |

在插件入口中读取设置：

```typescript
let settings: Record<string, unknown> = {};

async function handleInitialize(id: number, params: any) {
  settings = params.settings || {};
  console.error('[my-plugin] settings:', settings);
  // ...
}
```

**注意**：设置修改后不会实时推送给运行中的插件，需停止并重新启动插件后生效。

---

## 四、入口文件示例（TypeScript / Node.js）

下面是一个最小可运行的 MCP Server 骨架，包含 `initialize`、`tools/list`、`tools/call` 与进度通知。

`src/index.ts`：

```typescript
import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

let resourceDir = '';
let dataDir = '';

function send(message: unknown) {
  process.stdout.write(JSON.stringify(message) + '\n');
}

function log(message: string) {
  // 开发模式下核心会捕获 stderr 并转发
  console.error(`[browser-plugin] ${message}`);
}

// ===================== 工具实现 =====================

async function browserNavigate(args: { url: string; waitUntil?: string }) {
  log(`navigate to ${args.url}`);
  // 这里接入 Playwright 等浏览器自动化逻辑
  return {
    content: [{ type: 'text', text: `已导航到 ${args.url}` }],
    isError: false,
    metadata: { url: args.url, title: 'Example Domain' },
  };
}

async function browserClick(args: { selector: string }) {
  log(`click ${args.selector}`);
  return {
    content: [{ type: 'text', text: `已点击 ${args.selector}` }],
    isError: false,
    metadata: {},
  };
}

async function browserScreenshot(args: { fullPage?: boolean }) {
  log('screenshot');
  // 实际实现中生成 base64 图片
  const fakeBase64 = 'iVBORw0KGgoAAAA...';
  return {
    content: [
      { type: 'image', data: fakeBase64, mimeType: 'image/png' },
      { type: 'text', text: '已截取页面截图' },
    ],
    isError: false,
    metadata: {},
  };
}

const tools: Record<
  string,
  {
    description: string;
    inputSchema: object;
    requiredPermissions: string[];
    execute: (args: any) => Promise<{ content: any[]; isError: boolean; metadata?: object }>;
  }
> = {
  browser_navigate: {
    description: '打开或跳转到指定 URL',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        waitUntil: { type: 'string', enum: ['load', 'domcontentloaded', 'networkidle'], default: 'load' },
      },
      required: ['url'],
    },
    requiredPermissions: ['browser', 'network'],
    execute: browserNavigate,
  },
  browser_click: {
    description: '点击页面元素',
    inputSchema: {
      type: 'object',
      properties: { selector: { type: 'string' } },
      required: ['selector'],
    },
    requiredPermissions: ['browser'],
    execute: browserClick,
  },
  browser_screenshot: {
    description: '截取页面截图',
    inputSchema: {
      type: 'object',
      properties: { fullPage: { type: 'boolean', default: false } },
    },
    requiredPermissions: ['browser'],
    execute: browserScreenshot,
  },
};

// ===================== MCP 路由 =====================

async function handleInitialize(id: number, params: any) {
  resourceDir = params.resourceDir || '';
  dataDir = params.dataDir || '';
  const settings = params.settings || {};
  log(`resourceDir=${resourceDir}, dataDir=${dataDir}`);
  log(`settings=${JSON.stringify(settings)}`);

  send({
    jsonrpc: '2.0',
    id,
    result: {
      protocolVersion: '2024-11-05',
      capabilities: { tools: { listChanged: true } },
      serverInfo: { name: 'modelflow-browser', version: '1.0.0' },
      instructions: '浏览器自动化插件，支持导航、点击、填表、截图等操作。',
    },
  });
}

async function handleToolsList(id: number) {
  send({
    jsonrpc: '2.0',
    id,
    result: {
      tools: Object.entries(tools).map(([name, tool]) => ({
        name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        requiredPermissions: tool.requiredPermissions,
      })),
    },
  });
}

async function handleToolsCall(id: number, params: any) {
  const { name, arguments: args } = params;
  const tool = tools[name];

  if (!tool) {
    send({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Tool not found: ${name}` },
    });
    return;
  }

  try {
    const result = await tool.execute(args);

    // 示例：在长时间任务中发送进度通知
    send({
      jsonrpc: '2.0',
      method: 'modelflow/notify/progress',
      params: {
        step: 1,
        total: 1,
        action: name,
        message: `已完成 ${name}`,
        state: { url: result.metadata?.url || '' },
      },
    });

    send({ jsonrpc: '2.0', id, result });
  } catch (err: any) {
    send({
      jsonrpc: '2.0',
      id,
      result: {
        content: [{ type: 'text', text: err.message }],
        isError: true,
      },
    });
  }
}

function handleRequest(line: string) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch (e) {
    log('invalid json: ' + line);
    return;
  }

  const { id, method, params } = msg;

  if (method === 'initialize') {
    handleInitialize(id, params);
    return;
  }

  if (method === 'notifications/initialized') {
    log('MCP initialized by core');
    return;
  }

  if (method === 'tools/list') {
    handleToolsList(id);
    return;
  }

  if (method === 'tools/call') {
    handleToolsCall(id, params);
    return;
  }

  send({
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: `Method not found: ${method}` },
  });
}

rl.on('line', handleRequest);

process.on('SIGTERM', () => {
  log('SIGTERM received, cleaning up...');
  // 关闭浏览器、sidecar 子进程等
  process.exit(0);
});
```

`package.json` 示例：

```json
{
  "name": "modelflow-browser-plugin",
  "version": "1.0.0",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.5.0"
  }
}
```

`tsconfig.json` 示例：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true
  }
}
```

---

## 五、通信协议示例

### 5.1 核心 → 插件：initialize

```json
{
  "jsonrpc": "2.0",
  "id": 0,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {},
    "clientInfo": { "name": "ModelFlow", "version": "1.0.0" },
    "pluginId": "com.modelflow.browser",
    "resourceDir": "C:/Users/xxx/AppData/Local/ModelFlow/plugins/com.modelflow.browser",
    "dataDir": "C:/Users/xxx/AppData/Roaming/ModelFlow/plugins/com.modelflow.browser",
    "logLevel": "debug"
  }
}
```

插件响应：

```json
{
  "jsonrpc": "2.0",
  "id": 0,
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": { "tools": { "listChanged": true } },
    "serverInfo": { "name": "modelflow-browser", "version": "1.0.0" },
    "instructions": "浏览器自动化插件，支持导航、点击、填表、截图等操作。"
  }
}
```

### 5.2 核心 → 插件：tools/list

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list"
}
```

插件响应：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      {
        "name": "browser_navigate",
        "description": "打开或跳转到指定 URL",
        "inputSchema": {
          "type": "object",
          "properties": {
            "url": { "type": "string" },
            "waitUntil": { "type": "string", "default": "load" }
          },
          "required": ["url"]
        },
        "requiredPermissions": ["browser", "network"]
      }
    ]
  }
}
```

### 5.3 核心 → 插件：tools/call

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "browser_navigate",
    "arguments": { "url": "https://sina.com.cn" }
  }
}
```

插件响应：

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [
      { "type": "text", "text": "已导航到 https://sina.com.cn" }
    ],
    "isError": false,
    "metadata": {
      "url": "https://sina.com.cn",
      "title": "新浪首页"
    }
  }
}
```

### 5.4 插件 → 核心：进度通知

```json
{
  "jsonrpc": "2.0",
  "method": "modelflow/notify/progress",
  "params": {
    "step": 1,
    "total": 5,
    "action": "browser_click",
    "message": "正在点击提交按钮",
    "state": {
      "url": "https://example.com",
      "title": "Example Domain",
      "screenshotBase64": "...",
      "domText": "[1] <button id=\"submit\">提交</button>"
    }
  }
}
```

ModelFlow 的 `BrowserOperationPanel` 会监听这类通知并渲染。

---

## 六、浏览器插件推荐工具清单

| 工具名 | 功能 | 关键输入 |
| -------- | ------ | ---------- |
| `browser_navigate` | 打开/跳转 URL | `url`, `waitUntil` |
| `browser_get_content` | 获取页面文本或 HTML | `format: text\|html` |
| `browser_click` | 点击元素 | `selector` |
| `browser_fill` | 填写输入框 | `selector`, `value` |
| `browser_submit` | 提交表单 | `selector` |
| `browser_screenshot` | 截图 | `fullPage`, `selector` |
| `browser_scroll` | 滚动页面 | `direction`, `amount`, `selector` |
| `browser_execute_js` | 执行 JavaScript | `script`, `args` |
| `browser_switch_tab` | 切换标签页 | `index` / `title` |
| `browser_wait_for` | 等待元素出现 | `selector`, `text`, `timeout` |

建议每个工具返回 `metadata.url` 与 `metadata.title`，帮助模型保持上下文。

---

## 七、sidecar 资源约定

如果你的插件需要本地可执行文件（如 Playwright + Node），按以下结构打包：

```
my-browser-plugin/
└── sidecar/
    ├── node.exe
    ├── src-playwright/
    │   ├── dist/server.js
    │   └── node_modules/
    └── playwright-cache/
        └── chromium-*/chrome-win64/chrome.exe
```

### 7.1 获取 sidecar 路径

从 `initialize.params.resourceDir` 计算：

```javascript
const path = require('path');
const sidecarDir = path.join(resourceDir, 'sidecar');
const nodeExe = path.join(sidecarDir, 'node.exe');
const serverJs = path.join(sidecarDir, 'src-playwright', 'dist', 'server.js');
const browsersDir = path.join(sidecarDir, 'playwright-cache');
```

### 7.2 启动 sidecar

```javascript
const { spawn } = require('child_process');

const child = spawn(nodeExe, [serverJs], {
  env: {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: browsersDir,
  },
});

child.stdout.on('data', (data) => {
  const line = data.toString().trim();
  if (line.startsWith('PORT:')) {
    const port = parseInt(line.replace('PORT:', ''), 10);
    // sidecar 已启动，端口 = port
  }
});
```

---

## 八、插件窗口（Plugin Window）

当插件需要与用户进行复杂交互（如敏感输入、实时状态展示、远程控制）时，可以请求 ModelFlow Core 创建一个插件窗口。Core 负责窗口生命周期，插件负责窗口内的 HTML/JS 内容。

> **V1 范围**：当前版本只支持 `floating`（悬浮窗）模式。`docked`（侧边栏）和 `embedded`（嵌入式面板）计划在 V2 支持。

### 8.1 何时使用插件窗口

- 需要用户输入敏感信息（密码、验证码、私钥）。
- 需要向用户展示实时状态（浏览器截图、任务进度）。
- 需要用户进行精细操作（远程控制浏览器、选择文件区域）。

### 8.2 在 manifest.json 中声明窗口

```json
{
  "windows": [
    {
      "windowId": "browser-main",
      "entry": "ui/index.html",
      "title": "浏览器控制面板",
      "defaultMode": "floating",
      "defaultWidth": 900,
      "defaultHeight": 700
    }
  ],
  "permissions": [
    { "type": "window" }
  ]
}
```

字段说明：

| 字段 | 说明 |
|------|------|
| `windowId` | 插件内唯一窗口标识 |
| `entry` | 相对于插件根目录的 HTML 入口 |
| `title` | 窗口标题 |
| `defaultMode` | V1 只支持 `floating`；`docked` / `embedded` 为 V2 预留 |
| `defaultWidth` / `defaultHeight` | 默认尺寸 |

### 8.3 窗口生命周期协议

插件进程通过 stdio 向 Core 发送以下 MCP 扩展消息：

| 消息 | 方向 | 说明 |
|------|------|------|
| `modelflow/window/create` | 插件 → Core | 创建窗口（异步受理） |
| `modelflow/window/show` | 插件 → Core | 显示窗口 |
| `modelflow/window/hide` | 插件 → Core | 隐藏窗口 |
| `modelflow/window/close` | 插件 → Core | 关闭窗口（幂等） |
| `modelflow/window/postMessage` | 插件 → Core → Window Content | 插件向窗口内容发消息 |
| `modelflow/window/message` | Window Content → Core → 插件 | 窗口内容向插件发消息 |
| `modelflow/window/closed` | Core → 插件 | 窗口被用户关闭 |
| `modelflow/window/error` | Core → 插件 | 窗口相关错误通知 |

#### create 异步语义

插件发送 `create` 后，Core 立即返回 `created` 表示已受理；HTML 加载成功或失败通过后续 `error` 通知异步告知。

插件 → Core：

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "modelflow/window/create",
  "params": {
    "windowId": "browser-main",
    "title": "浏览器控制面板",
    "entry": "ui/index.html",
    "mode": "floating",
    "width": 900,
    "height": 700,
    "resizable": true,
    "instanceId": null
  }
}
```

Core → 插件：

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "windowId": "browser-main",
    "status": "created"
  }
}
```

加载失败时 Core 通知插件：

```json
{
  "jsonrpc": "2.0",
  "method": "modelflow/window/error",
  "params": {
    "windowId": "browser-main",
    "code": -32011,
    "message": "failed to load entry: ui/index.html"
  }
}
```

#### show / hide / close

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "modelflow/window/show",
  "params": { "windowId": "browser-main" }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "modelflow/window/hide",
  "params": { "windowId": "browser-main" }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "method": "modelflow/window/close",
  "params": { "windowId": "browser-main" }
}
```

`close` 是幂等的：窗口存在则关闭，不存在则静默成功。

用户关闭窗口时 Core 通知插件：

```json
{
  "jsonrpc": "2.0",
  "method": "modelflow/window/closed",
  "params": { "windowId": "browser-main" }
}
```

### 8.4 Window Bridge API

Window Content 中的 JS 通过全局 `modelflowBridge` 对象与 Core 通信：

```typescript
interface ModelFlowBridge {
  theme: {
    mode: 'light' | 'dark';
    colors: {
      bg: string;
      fg: string;
      border: string;
      primary: string;
      error: string;
    };
  };
  postMessage(payload: unknown): void;
  onMessage(handler: (msg: unknown) => void): void;
  onThemeChange(handler: (theme: ModelFlowBridge['theme']) => void): void;
}

declare const modelflowBridge: ModelFlowBridge;
```

使用示例：

```javascript
// 向插件进程发送消息
window.modelflowBridge.postMessage({
  type: 'userInput',
  data: { selector: '#password', value: '...' }
});

// 监听插件进程发来的消息
window.modelflowBridge.onMessage((msg) => {
  if (msg.type === 'showInputOverlay') {
    showOverlay(msg.data);
  }
});

// 监听主题变化
window.modelflowBridge.onThemeChange((theme) => {
  document.documentElement.style.setProperty('--bg', theme.colors.bg);
});
```

### 8.5 插件进程示例

```typescript
function send(message: unknown) {
  process.stdout.write(JSON.stringify(message) + '\n');
}

// 创建窗口
function createWindow() {
  send({
    jsonrpc: '2.0',
    id: 3,
    method: 'modelflow/window/create',
    params: {
      windowId: 'browser-main',
      title: '浏览器控制面板',
      entry: 'ui/index.html',
      mode: 'floating',
      width: 900,
      height: 700,
      resizable: true,
      instanceId: null,
    },
  });
}

// 显示窗口
function showWindow() {
  send({
    jsonrpc: '2.0',
    id: 4,
    method: 'modelflow/window/show',
    params: { windowId: 'browser-main' },
  });
}

// 向窗口内容发送消息
function postToWindow(payload: unknown) {
  send({
    jsonrpc: '2.0',
    method: 'modelflow/window/postMessage',
    params: { windowId: 'browser-main', payload },
  });
}

// 接收来自窗口内容的消息和错误通知
function handleCoreMessage(msg: any) {
  if (msg.method === 'modelflow/window/message') {
    const { payload } = msg.params;
    if (payload.type === 'userInput') {
      const { selector, value } = payload.data;
      page.fill(selector, value);
    }
  }
  if (msg.method === 'modelflow/window/error') {
    console.error(`window error [${msg.params.code}]: ${msg.params.message}`);
  }
  if (msg.method === 'modelflow/window/closed') {
    console.log('window closed by user');
  }
}
```

### 8.6 Window Content 示例

```html
<!-- ui/index.html -->
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>浏览器控制面板</title>
  <link rel="stylesheet" href="ui.css">
</head>
<body>
  <div id="overlay" class="hidden">
    <label id="overlay-label"></label>
    <input id="overlay-input" type="password">
    <button id="continue-btn">继续</button>
    <button id="cancel-btn">取消</button>
  </div>
  <script src="ui.js"></script>
</body>
</html>
```

```javascript
// ui/ui.js
window.modelflowBridge.onMessage((msg) => {
  if (msg.type === 'showInputOverlay') {
    document.getElementById('overlay-label').textContent = msg.data.label;
    document.getElementById('overlay-input').type = msg.data.inputType || 'text';
    document.getElementById('overlay').classList.remove('hidden');
  }
});

window.modelflowBridge.onThemeChange((theme) => {
  document.documentElement.style.setProperty('--bg', theme.colors.bg);
  document.documentElement.style.setProperty('--fg', theme.colors.fg);
});

document.getElementById('continue-btn').addEventListener('click', () => {
  const value = document.getElementById('overlay-input').value;
  window.modelflowBridge.postMessage({
    type: 'userInput',
    data: { selector: '#password', value }
  });
  document.getElementById('overlay').classList.add('hidden');
});

document.getElementById('cancel-btn').addEventListener('click', () => {
  window.modelflowBridge.postMessage({ type: 'userCancelled' });
  document.getElementById('overlay').classList.add('hidden');
});
```

### 8.7 内容安全策略（CSP）

插件窗口默认启用以下 CSP：

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data:;
connect-src 'none';
```

- 禁止加载远程 URL、CDN、iframe、XHR/fetch。
- 截图等二进制数据通过 Bridge 以 base64 发送，因此 `data:` 策略已满足需求。
- 建议插件优先使用外部 CSS 文件，减少 `unsafe-inline` 带来的攻击面。V2 可能收紧此策略。

### 8.8 窗口错误码

| 错误码 | 场景 |
|--------|------|
| `-32010` | 窗口 `entry` 文件不存在或无法读取 |
| `-32011` | 窗口创建失败（Webview 创建失败等） |
| `-32012` | 窗口已存在 |
| `-32013` | 窗口不存在 |
| `-32014` | 插件未声明 `window` 权限 |
| `-32015` | Webview 崩溃或被用户强制关闭 |

### 8.9 安全注意事项

- 窗口内容只能加载插件包内的本地资源，禁止远程 URL。
- Window Content 运行在隔离 Webview 中，启用 `contextIsolation` 和 `sandbox`。
- `modelflowBridge` 通过 preload script 注入，只暴露 `postMessage`、`onMessage`、`onThemeChange` 和 `theme`，不暴露 Node.js 或 Tauri API。
- 敏感数据（如密码）只做透传，不进入模型上下文、不打印到日志。
- 插件进程收到敏感输入后应立即使用，不在内存中长期保留。

---

## 九、本地调试

### 9.1 命令行测试

不依赖 ModelFlow，直接用命令行模拟核心：

```bash
cd my-browser-plugin
npm run build
echo '{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"Test","version":"1.0.0"},"pluginId":"com.modelflow.browser","resourceDir":"'$(pwd)'","dataDir":"'$(pwd)'/data","logLevel":"debug"}}' | node dist/index.js
```

### 9.2 MCP Inspector

使用官方工具测试 `tools/list` 和 `tools/call`：

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

### 9.3 在 ModelFlow 中加载

1. 打开 ModelFlow 设置。
2. 指定插件目录（如 `C:/plugins`）。
3. 把你的插件目录放进去。
4. 重启 ModelFlow。
5. 在模型对话中测试 `@模型名 打开新浪看看有什么大事`。

---

## 十、浏览器插件具体迁移参考

原 ModelFlow 浏览器实现位于 `feature/browser-automation` 分支，可参考以下文件：

| 原位置 | 功能 | 建议迁移位置 |
|--------|------|--------------|
| `src/utils/browser/types.ts` | 类型定义 | `plugins/com.modelflow.browser/src/types.ts` |
| `src/utils/browser/agent.ts` | 观察→决策→执行循环 | 拆分为 `src/tools/*` 或由模型驱动 |
| `src/utils/browser/promptBuilder.ts` | Prompt 构建 | 在插件内部按需保留 |
| `src/utils/browser/domSimplifier.ts` | DOM 简化 | `plugins/com.modelflow.browser/sidecar/src-playwright/lib/domSimplifier.js` |
| `src-tauri/src/browser/playwright/*` | Playwright sidecar | `plugins/com.modelflow.browser/sidecar/src-playwright/` |
| `src-tauri/src/browser/cdp/*` | CDP 后端 | 可作为插件的可选后端保留 |
| `src/components/BrowserOperationPanel.tsx` | UI 面板 | 由核心提供通用 `PluginWindow` 容器，浏览器插件提供 `ui/index.html` 内容 |

---

## 十一、常见坑点

1. **JSON-RPC 消息必须以 `\n` 结尾**  
   核心按行读取，一条消息一行。

2. **initialize 必须响应**  
   核心在启动插件后会等待 `initialize` 响应，超时未响应会判定插件启动失败。

3. **必须处理 `notifications/initialized`**  
   MCP 要求 Server 收到 `initialized` 通知后才进入正常运行期。

4. **sidecar 路径是相对插件根目录的**  
   不要写死绝对路径，用 `initialize.params.resourceDir` 拼接。

5. **权限声明必须完整**  
   如果调用需要 `network` 权限的工具但 manifest 没声明，Core 会拒绝。

6. **开发模式日志**  
   开发模式下把日志写到 `stderr`（`console.error`），核心会转发到 devtools。

7. **进程退出清理**  
   监听 `SIGTERM`，关闭浏览器和 sidecar 子进程，避免僵尸进程。

8. **MCP 协议版本**  
   基础协议使用 `2024-11-05`，不要和 ModelFlow 扩展版本混淆。

9. **插件窗口内容必须本地资源**  
   `entry` 只能指向插件包内的 HTML，禁止加载远程 URL，否则 Core 会拒绝。

10. **敏感数据不要进日志**  
    用户在插件窗口输入的密码等敏感信息，不要通过 `console.error` 打印，也不要返回给模型。

---

## 十二、示例仓库

建议提供最小可运行示例：

```
examples/browser-plugin-ts/
├── manifest.json
├── package.json
├── tsconfig.json
├── src/
│   └── index.ts
├── ui/                          # 可选：插件窗口示例
│   ├── index.html
│   └── ui.js
└── README.md
```

该示例实现一个 mock 浏览器插件：收到 `browser_navigate` / `browser_click` / `browser_screenshot` 后返回固定结果，用于验证协议跑通。可额外包含一个最小插件窗口示例，展示 `showInputOverlay` / `userInput` 消息交互。

---

## 十三、与核心团队的协作流程

1. 按本指南开发浏览器插件。
2. 在独立编辑器中完成本地测试（命令行 + MCP Inspector）。
3. 把插件目录打包为 zip 或提交到插件仓库。
4. ModelFlow 核心团队集成插件加载器后，把你的插件作为内置/预装插件。
5. 后续迭代由你独立维护插件代码。

---

**下一步**：等你完成浏览器插件最小可运行版本后，核心团队会基于它验证 `PLUGIN_PROTOCOL.md`，并调整协议中不合理的部分。

---

## 十四、消息源（Event Source）

除了被动等待模型调用工具，插件还可以声明**消息源**，让 runtime 定期轮询插件并把新消息作为 `RuntimeEvent` 分发给订阅的 agent。这适合邮件、IM、RSS 等需要“推”到 runtime 的场景。

### 14.1 在 manifest.json 中声明

```json
{
  "eventSources": [
    {
      "id": "inbox",
      "type": "poll",
      "tool": "list_emails",
      "topic": "email.received",
      "interval": 60
    }
  ],
  "permissions": [
    { "type": "event_source" }
  ]
}
```

字段说明：

| 字段 | 说明 |
|------|------|
| `id` | 插件内唯一源标识 |
| `type` | 目前仅支持 `"poll"` |
| `tool` | 每次轮询调用的 MCP 工具名 |
| `topic` | 新消息默认的事件 topic |
| `interval` | 轮询间隔（秒），最小 5 秒，默认 60 秒 |

### 14.2 轮询工具返回格式

被轮询的工具需要在 `metadata.messages` 中返回消息数组，每条消息必须包含稳定的 `id` 用于去重：

```json
{
  "content": [{ "type": "text", "text": "你有 1 封新邮件" }],
  "isError": false,
  "metadata": {
    "messages": [
      {
        "id": "email-003",
        "topic": "email.received",
        "from": "alice@example.com",
        "subject": "下周一会议安排",
        "body": "...",
        "timestamp": "2026-07-02T09:00:00Z"
      }
    ]
  }
}
```

- `id` 必填，用于去重。
- 单条消息里的 `topic` 可覆盖 manifest 里的默认 `topic`。
- `isError` 为 `true` 时 runtime 会跳过本次轮询结果。

### 14.3 事件消费

runtime 会把每条新消息包装成一个 `RuntimeEvent` 并送入 `EventBus`。agent 只要订阅对应 topic 即可自动触发，例如：

```rust
bus.subscribe(EventSubscription {
    sub_id: "email_sub".into(),
    agent_id: "rust_chat_agent".into(),
    topic_pattern: "email.received".into(),
    rate_limit_per_min: 60,
});
```

事件 `payload` 结构：

```json
{
  "plugin_id": "example.mail",
  "source_id": "inbox",
  "message": { /* 插件返回的原始消息对象 */ }
}
```

### 14.4 去重与持久化

runtime 会按 `plugin_id + source_id` 记录已见过的消息 `id`，并持久化到 `~/.ModelFlow/runtime/plugin_poll_seen.json`，避免应用重启后重复触发。

### 14.5 示例

参考 `examples/mail-plugin-ts/`，它在 `manifest.json` 中声明了一个 `email.received` 轮询源，并在 `list_emails` 工具的 `metadata.messages` 里返回带 `id` 的邮件列表。
