# ModelFlow 插件开发指南

> 本文档面向插件开发者，说明如何为 ModelFlow 编写、调试、打包 MCP 插件。

---

## 一、插件是什么

ModelFlow 插件是一个**独立进程**，通过 [MCP（Model Context Protocol）](https://modelcontextprotocol.io) over stdio 与 ModelFlow Core 通信。插件可以：

- 向模型暴露自定义工具（`tools/list`、`tools/call`）；
- 接收用户设置并在初始化时读取；
- 发送进度通知到 ModelFlow UI；
- 声明权限白名单，由 Core 在调用时校验。

插件可以用任何能读写 stdin/stdout 的语言实现（Node.js、Python、Rust、Go 等）。

---

## 二、最小插件示例

目录结构：

```
com.example.hello/
├── manifest.json
└── index.js
```

`manifest.json`：

```json
{
  "manifestVersion": "1.0",
  "id": "com.example.hello",
  "version": "1.0.0",
  "name": "Hello Plugin",
  "runtime": {
    "command": "node",
    "args": ["index.js"]
  },
  "permissions": [{ "type": "network", "allowedHosts": ["*"] }]
}
```

`index.js`：

```javascript
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin });

function send(message) {
  console.log(JSON.stringify(message));
}

rl.on('line', async (line) => {
  const req = JSON.parse(line);

  if (req.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: req.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: { listChanged: true } },
        serverInfo: { name: 'hello', version: '1.0.0' },
        instructions: '示例插件，提供一个问候工具。'
      }
    });
    send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
    return;
  }

  if (req.method === 'tools/list') {
    send({
      jsonrpc: '2.0',
      id: req.id,
      result: {
        tools: [{
          name: 'say_hello',
          description: '返回一句问候语',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string', description: '你的名字' }
            },
            required: ['name']
          }
        }]
      }
    });
    return;
  }

  if (req.method === 'tools/call') {
    const { name, arguments: args } = req.params;
    if (name === 'say_hello') {
      send({
        jsonrpc: '2.0',
        id: req.id,
        result: {
          content: [{ type: 'text', text: `你好，${args.name}！` }],
          isError: false
        }
      });
    } else {
      send({
        jsonrpc: '2.0',
        id: req.id,
        error: { code: -32601, message: `未知工具: ${name}` }
      });
    }
    return;
  }
});
```

---

## 三、插件包结构

插件以自包含目录或 zip 包交付。zip 文件名：`{id}-{version}.zip`，例如 `com.example.hello-1.0.0.zip`。zip 根目录即为插件根目录，不要多套一层文件夹。

```
com.example.my-plugin/
├── manifest.json          # 协议入口，必须
├── index.js               # 入口代码
├── sidecar/               # 可选：本地二进制、模型文件等
└── README.md              # 可选但建议
```

Core 加载插件时：

1. 解压 zip 到用户插件目录（`~/.ModelFlow/plugins/{id}`）。
2. 读取并校验 `manifest.json`。
3. 以插件目录为工作目录启动 `runtime.command`。
4. 执行 MCP 初始化握手。
5. 调用 `tools/list` 发现工具并注册到 `ToolRegistry`。

> **zip 包结构**：建议 zip 根目录即为插件根目录；Core 也兼容根目录下仅有一层子目录的情况（会自动查找子目录中的 `manifest.json`）。

---

## 四、`manifest.json` 规范

### 4.1 完整示例

```json
{
  "manifestVersion": "0.1",
  "id": "com.modelflow.browser",
  "version": "1.0.0",
  "name": "浏览器自动化",
  "description": "让模型通过 Playwright 操作浏览器",
  "author": "ModelFlow",
  "runtime": {
    "command": "node",
    "args": ["dist/index.js"],
    "workingDir": ".",
    "requires": { "node": ">=20.0.0" },
    "devMode": true,
    "logLevel": "debug"
  },
  "permissions": [
    { "type": "browser" },
    { "type": "network", "allowedHosts": ["*"] }
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
      "key": "apiUrl",
      "label": "API 地址",
      "type": "string",
      "default": "https://api.example.com",
      "required": true
    }
  ]
}
```

### 4.2 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `manifestVersion` | string | 是 | 插件协议版本，当前 `"1.0"` |
| `id` | string | 是 | 全局唯一标识，反域名风格 |
| `version` | string | 是 | SemVer 版本 |
| `name` | string | 是 | 显示名称 |
| `description` | string | 否 | 插件描述 |
| `author` | string | 否 | 作者 |
| `runtime.command` | string | 是 | 启动命令（`node`、`python`、可执行文件等） |
| `runtime.args` | string[] | 否 | 启动参数 |
| `runtime.workingDir` | string | 否 | 工作目录；留空或省略时默认插件根目录，`.` 也表示插件根目录；支持绝对路径与相对插件目录的路径 |
| `runtime.requires` | object | 否 | 环境依赖，见 4.3 |
| `runtime.devMode` | boolean | 否 | 开发模式，默认 `false` |
| `runtime.logLevel` | string | 否 | `debug`/`info`/`warn`/`error`，默认 `info` |
| `permissions` | array | 是 | 权限白名单，见 4.4 |
| `menuEntries` | array | 否 | 菜单入口，见 4.5 |
| `settings` | array | 否 | 用户设置项，见 4.6 |

### 4.3 运行环境声明

```json
{
  "runtime": {
    "requires": {
      "node": ">=20.0.0",
      "playwright": ">=1.40.0"
    }
  }
}
```

当前 Core 会读取该字段，但**不会主动安装依赖**，也**不会阻止插件加载**。插件作者应在 README 中说明安装步骤。

> **注意**：`runtime.requires` 与 `runtime.logLevel` 当前仅被读取/记录，`runtime.logLevel` 在 MCP `initialize` 中固定为 `"info"`，不会按 manifest 值传入。

### 4.4 权限声明

```json
[
  { "type": "browser" },
  { "type": "network", "allowedHosts": ["*"] },
  { "type": "filesystem", "allowedPaths": ["C:/Users/xxx/Downloads"] },
  { "type": "clipboard" },
  { "type": "notification" },
  { "type": "window" },
  { "type": "event_source" }
]
```

| 权限类型 | 说明 |
|----------|------|
| `browser` | 允许启动和操作浏览器 |
| `network` | 允许网络请求，可限制 `allowedHosts` |
| `filesystem` | 允许文件读写，可限制 `allowedPaths` |
| `clipboard` | 允许读写剪贴板 |
| `notification` | 允许发送系统通知 |
| `window` | 允许创建插件窗口 |
| `event_source` | 允许声明事件源（当前仅作声明，Core 尚未强制校验） |

工具应在 `tools/list` 的返回中附带 `requiredPermissions` 字段；未来版本 Core 会据此校验，当前实现尚未完全落地，声明仅作提示与审计。

### 4.5 菜单入口

```json
[
  {
    "label": "打开示例页",
    "action": "browser_navigate",
    "args": { "url": "https://example.com" },
    "section": "浏览器"
  }
]
```

> **注意**：`menuEntries` 当前版本**尚未实现**，仅保留字段。

### 4.6 设置项声明

```json
[
  {
    "key": "apiUrl",
    "label": "API 地址",
    "type": "string",
    "description": "自定义后端服务地址",
    "default": "https://api.example.com",
    "required": true
  }
]
```

支持的 `type`：`string`、`number`、`boolean`、`select`、`password`。

Core 在 `initialize` 时通过 `params.settings` 把当前值传给插件。前端按 `pluginId -> key -> value` 结构持久化到 `AppSettings.pluginSettings`；修改设置后需重启插件才能生效。

---

## 五、MCP 通信协议

### 5.1 消息格式

Core 与插件通过 stdin/stdout 交换 JSON-RPC 2.0 消息，每条消息以换行符 `\n` 结尾。

> **注意**：Rust 内部调用插件工具/请求时使用 UUID 字符串作为 `id`，以避免与前端数字 `id` 冲突；插件可按自身习惯使用数字或字符串 `id`。

### 5.2 初始化握手

Core 发送：

```json
{
  "jsonrpc": "2.0",
  "id": 0,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {},
    "clientInfo": { "name": "ModelFlow", "version": "1.2.0" },
    "pluginId": "com.example.hello",
    "resourceDir": "C:/Users/xxx/.ModelFlow/plugins/com.example.hello",
    "dataDir": "C:/Users/xxx/.ModelFlow/plugins/com.example.hello/data",
    "logLevel": "info",
    "settings": { "apiUrl": "https://api.example.com" }
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
    "serverInfo": { "name": "hello", "version": "1.0.0" },
    "instructions": "示例插件。"
  }
}
```

Core 发送 `notifications/initialized` 通知后，插件正式可用。

> **注意**：前端 `McpHost` 当前硬编码 `clientInfo.version` 为 `"1.0.0"`；Rust 侧使用 `env!("CARGO_PKG_VERSION")`。插件不应强依赖该版本值。

### 5.3 工具发现

Core 调用 `tools/list`，插件返回工具列表：

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
            "url": { "type": "string" }
          },
          "required": ["url"]
        },
        "requiredPermissions": [
          { "type": "browser" },
          { "type": "network", "allowedHosts": ["*"] }
        ]
      }
    ]
  }
}
```

### 5.4 工具执行模式

每个工具在 `tools/list` 中可以通过 `executionMode` 字段声明自己的执行模式，告诉模型和 Runtime 调用后如何返回结果：

| 模式 | 说明 | 工具返回示例 |
|------|------|--------------|
| `sync`（默认） | 同步工具，调用后 `tools/call` 立即返回最终结果，模型在同一轮继续执行。 | `{ "content": [{"type":"text","text":"完成"}], "isError": false }` |
| `async` | 异步工具，调用后返回 `task_id`，模型应结束当前 turn 并等待系统通过 `agent.{agent_id}.continue` 事件唤醒。 | `{ "content": [{"type":"text","text":"task-123"}], "isError": false, "asyncTask": { "task_id": "task-123", "status": "pending" } }` |
| `event_source` | 事件源工具，调用后持续产生事件；模型不等待单一结果，而是订阅相关 topic。 | 通过 `modelflow/notify/progress` 或自定义事件 topic 推送 |

声明示例：

```json
{
  "name": "qq.send_message_later",
  "description": "在指定时间后发送 QQ 消息",
  "executionMode": "async",
  "inputSchema": {
    "type": "object",
    "properties": {
      "remind_at": { "type": "number", "description": "Unix 时间戳秒数" },
      "content": { "type": "string", "description": "消息内容" }
    },
    "required": ["remind_at", "content"]
  }
}
```

规则：
- 未声明 `executionMode` 时，Core 默认按 `sync` 处理。
- `async` 工具返回后，模型**不应**继续在同一轮调用其他工具或生成回复，而应等待 continue 事件。
- `event_source` 工具通常需要配合 `event_source` 权限声明，并在初始化时告知 Core 相关 topic。

### 5.4.1 语义回调与事件源

ModelFlow 提供统一的语义回调机制 `system.register_callback`，插件工具也可以利用这套机制：当插件完成一个耗时任务或需要在未来某个条件满足时唤醒模型，只需通过 Runtime 事件循环发送一个 `agent.{agent_id}.continue` 事件，并在事件 payload 中携带 `async_task_results`。

插件开发者可以选择以下两种方式之一：

1. **声明为 `async` 工具**：工具被调用后立即返回 `task_id`，插件内部异步完成任务，完成后 emit `agent.{agent_id}.continue` 事件唤醒模型。适用于明确的“发起 → 完成”任务，例如文件转码、远程构建、长时间计算。
2. **声明为 `event_source` 工具/事件源**：插件持续产生事件（如消息推送、股票行情、设备状态），模型不等待单一结果，而是通过订阅相关 topic 被动接收。适用于流式或订阅型能力。

对于 `async` 工具，插件应在 `tools/call` 的 MCP 响应 **result** 中返回 `task_id`：

```json
{
  "task_id": "task-123",
  "status": "started"
}
```

Core 收到后自动创建 `AsyncTask` 并让 Agent 进入 `Sleep` 等待模式。

任务完成后，插件通过 **MCP 通知**（JSON-RPC 消息不带 `id`）上报结果：

```json
{"jsonrpc":"2.0","method":"notifications/tasks/completed","params":{"task_id":"task-123","result":"操作完成","success":true}}
```

Core 的 MCP stdout reader 会拦截此通知（不转发给前端），通过 `plugin.{plugin_id}.task.completed` 事件路由到持有该 `task_id` 的 AgentInstance，自动完成 `AsyncTask` 并发送 `agent.{agent_id}.continue` 唤醒模型。

完整的 async 工具流程：

```
[tools/call 请求]
{"jsonrpc":"2.0","id":"uuid-1","method":"tools/call","params":{"name":"heavy_task","arguments":{...}}}
    ↓
[tools/call 响应 — 立即返回 task_id]
{"jsonrpc":"2.0","id":"uuid-1","result":{"task_id":"task-123","status":"started"}}
    ↓  Core 创建 AsyncTask → Agent Sleep(5s)
    ↓  … 插件异步执行任务 …
    ↓
[通知 — 任务完成]
{"jsonrpc":"2.0","method":"notifications/tasks/completed","params":{"task_id":"task-123","result":"done","success":true}}
    ↓  MCP reader 拦截 → plugin.xxx.task.completed 事件
    ↓  dispatch_runtime_event 找到匹配 AgentInstance
    ↓  发送 agent.{agent_id}.continue + async_task_results
    ↓  Agent 被唤醒，继续执行
```

> **注意**：插件无需知道 Agent 的 `agent_id`，也无需知道当前是哪个 Agent 发起了调用。只需发送标准的 MCP 通知 `notifications/tasks/completed` 并带上 `task_id`，Core 会自动找到对应的 AgentInstance 并唤醒它。

### 5.5 工具调用

Core 调用 `tools/call`：

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "browser_navigate",
    "arguments": { "url": "https://example.com" }
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
      { "type": "text", "text": "已导航到 https://example.com" }
    ],
    "isError": false,
    "metadata": { "url": "https://example.com", "title": "Example Domain" }
  }
}
```

### 5.6 进度通知

#### MCP 标准进度通知

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/progress",
  "params": {
    "progressToken": 0,
    "progress": 50,
    "total": 100
  }
}
```

#### ModelFlow 扩展进度通知

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

Core 可将扩展进度渲染到浏览器操作面板或日志面板。

---

## 六、工具输出规范

### 6.1 成功输出

```json
{
  "content": [
    { "type": "text", "text": "操作成功" }
  ],
  "isError": false,
  "metadata": {}
}
```

### 6.2 图片输出

```json
{
  "content": [
    {
      "type": "image",
      "data": "iVBORw0KGgo...",
      "mimeType": "image/png"
    }
  ],
  "isError": false
}
```

> **注意**：当前 Rust Runtime 执行插件工具时仅收集 `content` 中 `type=text` 的 `text` 字段，图片与 `metadata` 会被丢弃。若需向模型传递图片或元数据，建议在 `text` 内容中描述。

### 6.3 业务错误

工具执行失败但协议正常时：

```json
{
  "content": [
    { "type": "text", "text": "未找到元素：button#submit" }
  ],
  "isError": true,
  "metadata": { "url": "https://example.com" }
}
```

> **注意**：`metadata` 当前不会被传入模型上下文；如需补充状态，请同时写入 `text` 内容。

### 6.4 协议错误

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "error": {
    "code": -32601,
    "message": "Method not found: browser_click"
  }
}
```

常用错误码：

| 错误码 | 含义 |
|--------|------|
| `-32700` | Parse error |
| `-32600` | Invalid Request |
| `-32601` | Method not found |
| `-32602` | Invalid params |
| `-32603` | Internal error |
| `-32000` | 插件业务错误 |
| `-32001` | 权限不足 |
| `-32002` | 运行环境不满足 |

---

## 七、调试方法

### 7.1 命令行测试

不依赖 ModelFlow，直接喂 JSON-RPC：

```bash
cd com.example.hello
echo '{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"Test","version":"1.0.0"},"pluginId":"com.example.hello","resourceDir":"'$(pwd)'","dataDir":"'$(pwd)'/data","logLevel":"debug"}}' | node index.js
```

### 7.2 MCP Inspector

```bash
npx @modelcontextprotocol/inspector node index.js
```

### 7.3 开发模式日志

设置 `runtime.devMode: true` 后，Core 会把插件 stderr 同时输出到控制台，并写入 `~/.ModelFlow/logs/mcp-{plugin_id}-stderr.log`（插件 ID 中的 `:` 会被替换为 `_`，例如 `mcp-com_example_plugin-stderr.log`）。

Rust 侧通用日志在 `~/.ModelFlow/logs/mcp-rust.log`。

### 7.4 卸载插件

前端可调用 `deletePlugin` / Tauri 命令 `delete_plugin_dir` 卸载插件；Rust 会校验目标目录位于 `plugins` 范围内后删除。

---

## 八、安全与审核

1. **权限白名单**：插件只能使用 `manifest.json` 中声明的权限；`event_source` 权限当前仅作声明。
2. **运行环境校验**：不满足 `runtime.requires` 的插件当前不会被拒绝加载。
3. **工具权限映射**：`requiredPermissions` 未来会用于校验，当前实现尚未完全落地。
4. **网络隔离**：`network` 权限可限制 `allowedHosts`。
5. **文件路径隔离**：`filesystem` 权限可限制 `allowedPaths`。
6. **审计日志**：所有工具调用记录到插件 `dataDir/logs/`。
7. **禁止插件间直接通信**：每个插件是独立进程。

---

## 九、相关源码

| 文件 | 说明 |
|------|------|
| `src-tauri/src/mcp/mod.rs` | MCP 模块入口 |
| `src-tauri/src/mcp/process.rs` | 插件进程管理、JSON-RPC 路由、工具调用 |
| `src-tauri/src/mcp/loader.rs` | 插件发现、加载、工具注册；支持无头 CLI |
| `src-tauri/src/mcp/plugin_install.rs` | zip 安装、manifest 解析 |
| `src-tauri/src/mcp/plugin_uninstall.rs` | 插件目录安全卸载 |
| `src-tauri/src/plugin_window/manager.rs` | 插件窗口管理 |
| `src-tauri/src/plugin_window/protocol.rs` | 插件窗口协议消息类型 |
| `src-tauri/src/plugin_window/bridge.rs` | 插件窗口 `window.modelflowBridge` 注入 |
| `src-tauri/src/runtime/sources/plugin_poll_source.rs` | 插件事件源轮询 |
| `src-tauri/src/runtime/tools/registry.rs` | ToolRegistry，内置工具与插件工具合并 |

---

## 十、插件窗口 API

插件可以声明嵌入式窗口，并在窗口内容与插件进程之间双向通信。

### 10.1 声明窗口

在 `manifest.json` 中增加 `windows` 字段：

```json
{
  "permissions": [
    { "type": "window" }
  ],
  "windows": [
    {
      "windowId": "main",
      "entry": "ui/index.html",
      "title": "示例面板",
      "defaultMode": "embedded",
      "defaultWidth": 360,
      "defaultHeight": 600
    }
  ]
}
```

| 字段 | 说明 |
|------|------|
| `windowId` | 窗口标识，插件内唯一 |
| `entry` | 相对于插件根目录的 HTML 入口路径 |
| `title` | 窗口标题 |
| `defaultMode` | `embedded` / `docked` / `floating`；**默认 `floating`** |
| `defaultWidth` / `defaultHeight` | 默认宽高 |

### 10.2 插件进程创建窗口

插件通过 stdout 发送 JSON-RPC 请求：

```json
{
  "jsonrpc": "2.0",
  "id": 100,
  "method": "modelflow/window/create",
  "params": {
    "windowId": "main",
    "entry": "ui/index.html",
    "title": "示例面板",
    "mode": "embedded",
    "width": 360,
    "height": 600
  }
}
```

Core 响应：

```json
{
  "jsonrpc": "2.0",
  "id": 100,
  "result": {
    "windowId": "main",
    "status": "created"
  }
}
```

### 10.3 窗口控制方法

| 方法 | 参数 | 说明 |
|------|------|------|
| `modelflow/window/create` | `{ windowId, entry, title, mode, width, height }` | 创建窗口 |
| `modelflow/window/show` | `{ windowId }` | 显示窗口 |
| `modelflow/window/hide` | `{ windowId }` | 隐藏窗口 |
| `modelflow/window/close` | `{ windowId }` | 关闭窗口 |
| `modelflow/window/postMessage` | `{ windowId, payload }` | 向窗口发送消息 |

### 10.3.1 前端可调用命令

除插件进程通过 stdout 发送窗口方法外，前端/窗口侧还可直接调用以下 Tauri 命令：

| 命令 | 说明 |
|------|------|
| `register_plugin_window_manifest` | 注册插件窗口 manifest |
| `unregister_plugin_window` | 注销某插件的所有窗口 |
| `list_plugin_windows` | 列出当前已创建窗口 |
| `sync_plugin_window_theme` | 同步主题到所有插件窗口 |
| `plugin_window_message` | 窗口向插件进程发消息 |
| `position_plugin_webview` | 当前为 no-op（embedded iframe 由前端布局控制） |

### 10.4 窗口加载 URL

窗口实际以 iframe 形式嵌入主界面右侧边栏。URL 中只包含 `entry` 的文件名，目录部分用于 Rust 侧资源解析。

- Windows / Android：`http://plugin.localhost/{plugin_id}/{window_id}/{entry_file}`
- macOS / iOS / Linux：`plugin://localhost/{plugin_id}/{window_id}/{entry_file}`

示例：

```
http://plugin.localhost/com.example.plugin/main/index.html
```

> **自定义协议与 CSP**：Rust 注册了 `plugin://`/`http://plugin.localhost` 自定义协议，`resolve_plugin_asset` 会解析资源、防止路径遍历，并对 HTML 自动注入 `window.modelflowBridge`。插件窗口受 CSP 限制（如 `connect-src 'none'`），内部 fetch/xhr 会受限。

### 10.5 推荐：使用 `window.modelflowBridge`

ModelFlow 会自动向插件窗口 HTML 注入 `window.modelflowBridge`，无需手动 import Tauri API：

```javascript
// 发送消息到插件进程
window.modelflowBridge.postMessage({ action: 'userClicked', data: 123 });

// 接收插件进程消息
window.modelflowBridge.onMessage((payload) => {
  console.log('收到插件进程消息:', payload);
});

// 监听主题变化
window.modelflowBridge.onThemeChange((theme) => {
  console.log('主题变化:', theme.mode, theme.colors);
});
```

该 bridge 兼容 Tauri 原生环境与 iframe embedded 模式（通过 `window.parent.postMessage` 回退）。

### 10.6 窗口接收 Core 事件

窗口内 iframe 可通过 Tauri event API 监听以下事件：

| 事件 | 载荷 | 说明 |
|------|------|------|
| `modelflow://window/created` | `WindowCreatedEvent` | 窗口已创建 |
| `modelflow://window/shown` | `WindowVisibilityEvent` | 窗口已显示 |
| `modelflow://window/hidden` | `WindowVisibilityEvent` | 窗口已隐藏 |
| `modelflow://window/removed` | `WindowRemovedEvent` | 窗口已关闭 |
| `modelflow://window/postMessage` | `WindowPostMessageEvent` | 插件进程发来消息 |
| `modelflow://window/themeChanged` | `ThemeChangedEvent` | 主题切换通知 |

示例（窗口内）：

```javascript
import { listen } from '@tauri-apps/api/event';

listen('modelflow://window/postMessage', (event) => {
  console.log('收到插件进程消息:', event.payload);
});
```

### 10.7 窗口向插件进程发消息

窗口内调用 Tauri 命令 `plugin_window_message`：

```javascript
import { invoke } from '@tauri-apps/api/core';

await invoke('plugin_window_message', {
  payload: {
    pluginId: 'com.example.plugin',
    windowId: 'main',
    payload: { action: 'userClicked', data: 123 }
  }
});
```

插件进程 stdout 会收到：

```json
{
  "jsonrpc": "2.0",
  "method": "modelflow/window/message",
  "params": {
    "windowId": "main",
    "payload": { "action": "userClicked", "data": 123 }
  }
}
```

### 10.8 窗口错误码

| 错误码 | 含义 |
|--------|------|
| `-32010` | 入口文件缺失或不可访问 |
| `-32011` | 窗口创建失败 |
| `-32012` | 窗口已存在 |
| `-32013` | 窗口未找到 |
| `-32014` | 缺少 `window` 权限 |
| `-32015` | WebView 崩溃 |

---

## 十一、Runtime 通信与事件源

插件可以作为 ModelFlow AI OS Runtime 的事件源，让 Agent 在后台响应外部消息。

### 11.1 声明事件源

在 `manifest.json` 中增加 `eventSources`：

```json
{
  "permissions": [
    { "type": "event_source" },
    { "type": "network", "allowedHosts": ["api.example.com"] }
  ],
  "eventSources": [
    {
      "id": "inbox",
      "type": "poll",
      "tool": "list_messages",
      "topic": "message.received",
      "interval": 60,
      "pollArguments": { "limit": 10 }
    }
  ]
}
```

> **注意**：声明 `eventSources` 后，还需前端（或 CLI 启动逻辑）调用 `sync_plugin_event_sources` 将配置同步到 Rust `RuntimeState.plugin_poll_configs`，`PluginPollSource` 才会开始轮询。

| 字段 | 说明 |
|------|------|
| `id` | 事件源标识，插件内唯一 |
| `type` | 当前仅支持 `poll` |
| `tool` | 每次轮询调用的 MCP 工具名 |
| `topic` | 默认 emit 的 RuntimeEvent topic |
| `interval` | 轮询间隔秒数，默认 60，最小 5 |
| `pollArguments` | 每次调用传给工具的静态参数 |

### 11.2 轮询工具返回值约定

轮询工具应在 `result.metadata.messages` 返回消息数组：

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [{ "type": "text", "text": "拉取到 2 条新消息" }],
    "isError": false,
    "metadata": {
      "messages": [
        {
          "id": "msg-001",
          "topic": "message.received",
          "content": "你好",
          "sender": "user1"
        }
      ]
    }
  }
}
```

每条消息可包含：

| 字段 | 说明 |
|------|------|
| `id` | 消息唯一标识，用于去重；无 `id` 时 Core 使用消息 JSON 的 hash 去重 |
| `topic` | 覆盖默认 topic；Core 会按此 topic 路由 |
| `content` | 正文内容；Core 可能附加 openid/groupOpenid/msgId/msgSeq 及回复指引 |
| `openid` / `groupOpenid` | 发送者/群标识 |
| `messageType` | 如 `c2c` / `group` |
| `msgId` / `msgSeq` | 被动回复所需原消息标识 |

> **去重与状态持久化**：Core 使用 `DedupStore` 对 `plugin_id:source_id` 维度去重，状态持久化到 `~/.ModelFlow/runtime/plugin_poll_seen.json`。

### 11.3 RuntimeEvent 路由

Core 将每条新消息转换为 `RuntimeEvent`：

```json
{
  "id": "uuid",
  "trace_id": "uuid",
  "topic": "message.received",
  "source": "plugin_poll:com.example.plugin:inbox",
  "payload": {
    "plugin_id": "com.example.plugin",
    "source_id": "inbox",
    "message": { ... },
    "content": "收到插件消息: 你好"
  },
  "timestamp": 1234567890,
  "priority": 45
}
```

订阅了 `message.received`（或通配 `message.**`）的 Agent 会被调度执行。

### 11.4 插件主动发送 Runtime 事件

插件可以通过 `tools/call` 暴露一个工具（例如 `emit_event`），由 Agent 调用后间接触发事件；也可以在未来版本通过 MCP 扩展通知直接 emit。

---

## 十二、ModelFlow 为插件提供的关键能力

插件在获得相应权限后，可以复用 ModelFlow 的以下能力：

### 12.1 多模型统一调用

ModelFlow 内置 25+ 模型提供商适配。插件无需关心各家 API 差异；若插件需要模型能力，应通过暴露工具让 Agent 调用，由 Agent 走 Rust `LlmClient` 或 TS `streamChat`。

### 12.2 工具注册与 Agent 循环

- 插件工具自动合并到 Rust `ToolRegistry` 与前端 `BUILTIN_TOOLS`。
- Agent 在多轮循环中可连续调用多个插件工具。
- 工具调用使用 XML `<tool_call>` 格式，参数自动校验。

### 12.3 本地系统能力

| 能力 | 对应内置工具 | 插件可触发方式 |
|------|-------------|----------------|
| 执行系统命令 | `execute_command` | Agent 调用 |
| 读写文件 | `read_file` / `write_file` / `write_binary_file` | Agent 调用 |
| 列出目录 | `list_directory` | Agent 调用 |
| SQLite 查询 | `db_query` | Agent 调用 |
| 联网搜索 | `search_web` / `search_brave` / `search_tavily` | Agent 调用 |
| 浏览器自动化 | `browser_*` 系列 | Agent 调用 |

### 12.4 上下文与记忆

- Agent 实例上下文持久化到 `~/.ModelFlow/runtime/`。
- 用户长期记忆自动注入到 system message。
- 插件可通过返回 `metadata` 向模型补充当前状态。

### 12.5 工作流与计划

- 工作流节点可直接调用插件工具（`plugin` 节点）。
- 任务计划（Plan）可将插件作为步骤执行者，或让 Agent 调用插件工具完成步骤。

### 12.6 事件总线

- EventBus 支持 `.` 分隔主题与 `*` / `**` 通配订阅。
- 插件事件源、定时器、文件变化均可作为事件生产者。

---

## 十三、版本历史

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.0 | 2026-07-08 | 合并 `PLUGIN_DEVELOPMENT_GUIDEV1.2.md` 与 `PLUGIN_PROTOCOL.md`，整理为开发指南 |
| 1.2 | 2026-07-08 | 依据全量代码扫描，标注未实现字段/权限、补充窗口 Bridge/协议/CSP/命令、事件源同步与去重、设置存储、卸载 API |

---

*最后更新：2026-07-08（依据全量代码扫描，标注未实现字段/权限、补充窗口 Bridge/协议/CSP/命令、事件源同步与去重、设置存储、卸载 API）*
