# ModelFlow Plugin Development Guide

> This document is for plugin developers and explains how to write, debug, and package MCP plugins for ModelFlow.

---

## 1. What Is a Plugin

A ModelFlow plugin is an **independent process** that communicates with ModelFlow Core via [MCP (Model Context Protocol)](https://modelcontextprotocol.io) over stdio. A plugin can:

- Expose custom tools to models (`tools/list`, `tools/call`);
- Receive user settings at initialization;
- Send progress notifications to the ModelFlow UI;
- Declare a permission whitelist that Core validates at call time.

Plugins can be written in any language capable of reading/writing stdin/stdout (Node.js, Python, Rust, Go, etc.).

---

## 2. Minimal Plugin Example

Directory structure:

```
com.example.hello/
├── manifest.json
└── index.js
```

`manifest.json`:

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

`index.js`:

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
        instructions: 'A sample plugin that provides a greeting tool.'
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
          description: 'Returns a greeting',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Your name' }
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
          content: [{ type: 'text', text: `Hello, ${args.name}!` }],
          isError: false
        }
      });
    } else {
      send({
        jsonrpc: '2.0',
        id: req.id,
        error: { code: -32601, message: `Unknown tool: ${name}` }
      });
    }
    return;
  }
});
```

---

## 3. Plugin Package Structure

Plugins are delivered as self-contained directories or zip archives. Zip filename convention: `{id}-{version}.zip`, e.g. `com.example.hello-1.0.0.zip`. The zip root is the plugin root — do not nest inside an extra folder.

```
com.example.my-plugin/
├── manifest.json          # Required: protocol entry point
├── index.js               # Entry code
├── sidecar/               # Optional: local binaries, model files, etc.
└── README.md              # Optional but recommended
```

When Core loads a plugin:

1. Extract the zip to the user plugin directory (`~/.ModelFlow/plugins/{id}`).
2. Read and validate `manifest.json`.
3. Launch `runtime.command` with the plugin directory as working directory.
4. Perform the MCP initialization handshake.
5. Call `tools/list` to discover tools and register them in the `ToolRegistry`.

> **Zip layout**: The recommended convention is to have the plugin root as the zip root. Core also tolerates a single nested directory (auto-detects `manifest.json` inside).

---

## 4. `manifest.json` Specification

### 4.1 Full Example

```json
{
  "manifestVersion": "1.0",
  "id": "com.modelflow.browser",
  "version": "1.0.0",
  "name": "Browser Automation",
  "description": "Let models control a browser via Playwright",
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
      "label": "Open Example",
      "action": "browser_navigate",
      "args": { "url": "https://example.com" },
      "section": "Browser"
    }
  ],
  "settings": [
    {
      "key": "apiUrl",
      "label": "API URL",
      "type": "string",
      "default": "https://api.example.com",
      "required": true
    }
  ]
}
```

### 4.2 Field Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `manifestVersion` | string | Yes | Plugin protocol version, currently `"1.0"` |
| `id` | string | Yes | Globally unique identifier, reverse-domain style |
| `version` | string | Yes | SemVer version |
| `name` | string | Yes | Display name |
| `description` | string | No | Plugin description |
| `author` | string | No | Author name |
| `runtime.command` | string | Yes | Launch command (`node`, `python`, binary, etc.) |
| `runtime.args` | string[] | No | Launch arguments |
| `runtime.workingDir` | string | No | Working directory; defaults to plugin root when omitted; `.` also means plugin root; supports absolute and relative-to-plugin paths |
| `runtime.requires` | object | No | Environment dependencies, see 4.3 |
| `runtime.devMode` | boolean | No | Dev mode, default `false` |
| `runtime.logLevel` | string | No | `debug` / `info` / `warn` / `error`, default `info` |
| `permissions` | array | Yes | Permission whitelist, see 4.4 |
| `menuEntries` | array | No | Menu entries, see 4.5 |
| `settings` | array | No | User-facing settings, see 4.6 |

### 4.3 Runtime Requirements

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

Core currently reads this field but does **not auto-install dependencies** and does **not block plugin loading** based on it. Plugin authors should document installation steps in their README.

> **Note**: `runtime.requires` and `runtime.logLevel` are currently only read/logged. `runtime.logLevel` is fixed to `"info"` in the MCP `initialize` params regardless of the manifest value.

### 4.4 Permissions

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

| Permission Type | Description |
|-----------------|-------------|
| `browser` | Allow launching and controlling a browser |
| `network` | Allow network requests, optionally restricted by `allowedHosts` |
| `filesystem` | Allow file read/write, optionally restricted by `allowedPaths` |
| `clipboard` | Allow read/write clipboard |
| `notification` | Allow sending system notifications |
| `window` | Allow creating plugin windows |
| `event_source` | Allow declaring event sources (currently declaration-only, not enforced by Core) |

Tools should include `requiredPermissions` in their `tools/list` response. Future Core versions will validate against this.

### 4.5 Menu Entries

```json
[
  {
    "label": "Open Example",
    "action": "browser_navigate",
    "args": { "url": "https://example.com" },
    "section": "Browser"
  }
]
```

> **Note**: `menuEntries` is **not yet implemented** in the current version; the field is reserved.

### 4.6 Settings

```json
[
  {
    "key": "apiUrl",
    "label": "API URL",
    "type": "string",
    "description": "Custom backend service URL",
    "default": "https://api.example.com",
    "required": true
  }
]
```

Supported `type` values: `string`, `number`, `boolean`, `select`, `password`.

Core passes current settings via `params.settings` during `initialize`. The frontend persists settings as `pluginId -> key -> value` in `AppSettings.pluginSettings`. Changes take effect after restarting the plugin.

---

## 5. MCP Communication Protocol

### 5.1 Message Format

Core and plugins exchange JSON-RPC 2.0 messages over stdin/stdout, one message per line terminated with `\n`.

> **Note**: When Rust internally calls plugin tools, it uses UUID strings as `id` to avoid collisions with frontend numeric `id`s. Plugins may use numeric or string `id`s as they prefer.

### 5.2 Initialization Handshake

Core sends:

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

Plugin responds:

```json
{
  "jsonrpc": "2.0",
  "id": 0,
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": { "tools": { "listChanged": true } },
    "serverInfo": { "name": "hello", "version": "1.0.0" },
    "instructions": "A sample plugin."
  }
}
```

After Core sends the `notifications/initialized` notification, the plugin is officially ready.

> **Note**: The frontend `McpHost` currently hardcodes `clientInfo.version` as `"1.0.0"`; the Rust side uses `env!("CARGO_PKG_VERSION")`. Plugins should not depend on this version value.

### 5.3 Tool Discovery

Core calls `tools/list`, plugin returns the tool list:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      {
        "name": "browser_navigate",
        "description": "Navigate to a URL",
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

### 5.4 Tool Execution Modes

Each tool can declare an `executionMode` in `tools/list` to tell the model and Runtime how results are returned:

| Mode | Description | Tool Return Example |
|------|-------------|---------------------|
| `sync` (default) | Synchronous tool: `tools/call` returns the final result immediately; the model continues in the same turn. | `{ "content": [{"type":"text","text":"Done"}], "isError": false }` |
| `async` | Async tool: returns a `task_id` immediately; the model should end the current turn and wait for the system to wake it via an `agent.{agent_id}.continue` event. | `{ "content": [{"type":"text","text":"task-123"}], "isError": false, "asyncTask": { "task_id": "task-123", "status": "pending" } }` |
| `event_source` | Event source tool: continuously produces events after invocation; the model does not wait for a single result but subscribes to the relevant topic. | Pushes via `modelflow/notify/progress` or custom event topic |

Declaration example:

```json
{
  "name": "qq.send_message_later",
  "description": "Send a QQ message at a specified time",
  "executionMode": "async",
  "inputSchema": {
    "type": "object",
    "properties": {
      "remind_at": { "type": "number", "description": "Unix timestamp in seconds" },
      "content": { "type": "string", "description": "Message content" }
    },
    "required": ["remind_at", "content"]
  }
}
```

Rules:
- When `executionMode` is omitted, Core defaults to `sync`.
- After an `async` tool returns, the model **should not** call other tools or generate a response in the same turn — it should wait for the continue event.
- `event_source` tools typically require the `event_source` permission and should inform Core of relevant topics during initialization.

#### 5.4.1 Semantic Callbacks & Event Sources

ModelFlow provides a unified semantic callback mechanism `system.register_callback`. Plugin tools can also use this: when a plugin completes a long-running task or needs to wake the model when a condition is met, it simply sends an `agent.{agent_id}.continue` event through the Runtime event loop with `async_task_results` in the payload.

Plugin developers can choose one of two approaches:

1. **Declare as `async` tool**: The tool returns a `task_id` immediately upon invocation. The plugin completes the task asynchronously, then emits an `agent.{agent_id}.continue` event to wake the model. Best for clear "start → complete" tasks like file transcoding, remote builds, or long computations.
2. **Declare as `event_source` tool / event source**: The plugin continuously produces events (e.g. message push, stock quotes, device status). The model does not wait for a single result but passively receives events by subscribing to the relevant topic. Best for streaming or subscription-type capabilities.

For `async` tools, the plugin should return a `task_id` in the `tools/call` MCP response **result**:

```json
{
  "task_id": "task-123",
  "status": "started"
}
```

Core automatically creates an `AsyncTask` and puts the Agent into `Sleep` waiting mode upon receiving this.

When the task completes, the plugin reports the result via an **MCP notification** (JSON-RPC message without an `id`):

```json
{"jsonrpc":"2.0","method":"notifications/tasks/completed","params":{"task_id":"task-123","result":"Operation complete","success":true}}
```

Core's MCP stdout reader intercepts this notification (does not forward to the frontend) and routes it via the `plugin.{plugin_id}.task.completed` event to the AgentInstance holding that `task_id`, automatically completing the `AsyncTask` and sending `agent.{agent_id}.continue` to wake the model.

Complete async tool flow:

```
[tools/call request]
{"jsonrpc":"2.0","id":"uuid-1","method":"tools/call","params":{"name":"heavy_task","arguments":{...}}}
    ↓
[tools/call response — returns task_id immediately]
{"jsonrpc":"2.0","id":"uuid-1","result":{"task_id":"task-123","status":"started"}}
    ↓  Core creates AsyncTask → Agent Sleep(5s)
    ↓  … plugin executes task asynchronously …
    ↓
[Notification — task completed]
{"jsonrpc":"2.0","method":"notifications/tasks/completed","params":{"task_id":"task-123","result":"done","success":true}}
    ↓  MCP reader intercepts → plugin.xxx.task.completed event
    ↓  dispatch_runtime_event finds matching AgentInstance
    ↓  sends agent.{agent_id}.continue + async_task_results
    ↓  Agent is woken and continues execution
```

> **Note**: The plugin does not need to know the Agent's `agent_id`, nor which Agent initiated the call. Simply send the standard MCP notification `notifications/tasks/completed` with the `task_id`, and Core will automatically find the matching AgentInstance and wake it.

### 5.5 Tool Invocation

Core calls `tools/call`:

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

Plugin response:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [
      { "type": "text", "text": "Navigated to https://example.com" }
    ],
    "isError": false,
    "metadata": { "url": "https://example.com", "title": "Example Domain" }
  }
}
```

### 5.6 Progress Notifications

#### MCP Standard Progress Notification

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

#### ModelFlow Extended Progress Notification

```json
{
  "jsonrpc": "2.0",
  "method": "modelflow/notify/progress",
  "params": {
    "step": 1,
    "total": 5,
    "action": "browser_click",
    "message": "Clicking the submit button",
    "state": {
      "url": "https://example.com",
      "title": "Example Domain",
      "screenshotBase64": "...",
      "domText": "[1] <button id=\"submit\">Submit</button>"
    }
  }
}
```

Core may render extended progress in a browser operation panel or log panel.

---

## 6. Tool Output Specification

### 6.1 Success Output

```json
{
  "content": [
    { "type": "text", "text": "Operation succeeded" }
  ],
  "isError": false,
  "metadata": {}
}
```

### 6.2 Image Output

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

> **Note**: The current Rust Runtime only collects `text` fields from `type=text` content items when executing plugin tools. Images and `metadata` are discarded. To pass images or metadata to the model, include the information in `text` content.

### 6.3 Business Errors

When tool execution fails but the protocol is intact:

```json
{
  "content": [
    { "type": "text", "text": "Element not found: button#submit" }
  ],
  "isError": true,
  "metadata": { "url": "https://example.com" }
}
```

> **Note**: `metadata` is currently not passed into the model context. Include supplementary state in `text` content if needed.

### 6.4 Protocol Errors

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

Common error codes:

| Code | Meaning |
|------|---------|
| `-32700` | Parse error |
| `-32600` | Invalid Request |
| `-32601` | Method not found |
| `-32602` | Invalid params |
| `-32603` | Internal error |
| `-32000` | Plugin business error |
| `-32001` | Insufficient permissions |
| `-32002` | Runtime environment not met |

---

## 7. Debugging

### 7.1 Command-Line Testing

Test without ModelFlow by piping JSON-RPC directly:

```bash
cd com.example.hello
echo '{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"Test","version":"1.0.0"},"pluginId":"com.example.hello","resourceDir":"'$(pwd)'","dataDir":"'$(pwd)'/data","logLevel":"debug"}}' | node index.js
```

### 7.2 MCP Inspector

```bash
npx @modelcontextprotocol/inspector node index.js
```

### 7.3 Dev Mode Logging

When `runtime.devMode: true` is set, Core outputs plugin stderr to the console and writes it to `~/.ModelFlow/logs/mcp-{plugin_id}-stderr.log` (`:` in IDs is replaced with `_`, e.g. `mcp-com_example_plugin-stderr.log`).

Rust-side general logs go to `~/.ModelFlow/logs/mcp-rust.log`.

### 7.4 Uninstalling a Plugin

The frontend can call `deletePlugin` / the Tauri command `delete_plugin_dir` to uninstall. Rust verifies the target directory is within the `plugins` scope before deletion.

---

## 8. Security & Audit

1. **Permission whitelist**: Plugins can only use permissions declared in `manifest.json`; `event_source` permission is currently declaration-only.
2. **Environment validation**: Plugins not meeting `runtime.requires` are currently not blocked from loading.
3. **Tool permission mapping**: `requiredPermissions` will be enforced in future versions; currently not fully implemented.
4. **Network isolation**: The `network` permission can restrict `allowedHosts`.
5. **Filesystem path isolation**: The `filesystem` permission can restrict `allowedPaths`.
6. **Audit logs**: All tool invocations are recorded in the plugin `dataDir/logs/`.
7. **No inter-plugin communication**: Each plugin is an independent process.

---

## 9. Relevant Source Code

| File | Description |
|------|-------------|
| `src-tauri/src/mcp/mod.rs` | MCP module entry point |
| `src-tauri/src/mcp/process.rs` | Plugin process management, JSON-RPC routing, tool invocation |
| `src-tauri/src/mcp/loader.rs` | Plugin discovery, loading, tool registration; supports headless CLI |
| `src-tauri/src/mcp/plugin_install.rs` | Zip installation, manifest parsing |
| `src-tauri/src/mcp/plugin_uninstall.rs` | Safe plugin directory removal |
| `src-tauri/src/plugin_window/manager.rs` | Plugin window management |
| `src-tauri/src/plugin_window/protocol.rs` | Plugin window protocol message types |
| `src-tauri/src/plugin_window/bridge.rs` | `window.modelflowBridge` injection |
| `src-tauri/src/runtime/sources/plugin_poll_source.rs` | Plugin event source polling |
| `src-tauri/src/runtime/tools/registry.rs` | ToolRegistry — built-in + plugin tools |

---

## 10. Plugin Window API

Plugins can declare embedded windows and communicate bidirectionally between window content and the plugin process.

### 10.1 Declaring Windows

Add a `windows` field to `manifest.json`:

```json
{
  "permissions": [
    { "type": "window" }
  ],
  "windows": [
    {
      "windowId": "main",
      "entry": "ui/index.html",
      "title": "Sample Panel",
      "defaultMode": "embedded",
      "defaultWidth": 360,
      "defaultHeight": 600
    }
  ]
}
```

| Field | Description |
|-------|-------------|
| `windowId` | Window identifier, unique within the plugin |
| `entry` | Path to HTML entry point, relative to plugin root |
| `title` | Window title |
| `defaultMode` | `embedded` / `docked` / `floating`; **defaults to `floating`** |
| `defaultWidth` / `defaultHeight` | Default dimensions |

### 10.2 Creating a Window from the Plugin Process

The plugin sends a JSON-RPC request over stdout:

```json
{
  "jsonrpc": "2.0",
  "id": 100,
  "method": "modelflow/window/create",
  "params": {
    "windowId": "main",
    "entry": "ui/index.html",
    "title": "Sample Panel",
    "mode": "embedded",
    "width": 360,
    "height": 600
  }
}
```

Core response:

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

### 10.3 Window Control Methods

| Method | Parameters | Description |
|--------|------------|-------------|
| `modelflow/window/create` | `{ windowId, entry, title, mode, width, height }` | Create window |
| `modelflow/window/show` | `{ windowId }` | Show window |
| `modelflow/window/hide` | `{ windowId }` | Hide window |
| `modelflow/window/close` | `{ windowId }` | Close window |
| `modelflow/window/postMessage` | `{ windowId, payload }` | Send message to window |

#### 10.3.1 Frontend-Callable Commands

In addition to plugin-to-Core window methods over stdout, the frontend/window side can directly call these Tauri commands:

| Command | Description |
|---------|-------------|
| `register_plugin_window_manifest` | Register plugin window manifest |
| `unregister_plugin_window` | Unregister all windows for a plugin |
| `list_plugin_windows` | List currently created windows |
| `sync_plugin_window_theme` | Sync theme to all plugin windows |
| `plugin_window_message` | Window sends message to plugin process |
| `position_plugin_webview` | Currently a no-op (embedded iframe layout is controlled by the frontend) |

### 10.4 Window Load URL

Windows are rendered as iframes embedded in the main interface's right sidebar. The URL only contains the filename from `entry`; the directory portion is used by Rust for resource resolution.

- Windows / Android: `http://plugin.localhost/{plugin_id}/{window_id}/{entry_file}`
- macOS / iOS / Linux: `plugin://localhost/{plugin_id}/{window_id}/{entry_file}`

Example:

```
http://plugin.localhost/com.example.plugin/main/index.html
```

> **Custom protocol & CSP**: Rust registers the `plugin://` / `http://plugin.localhost` custom protocols. `resolve_plugin_asset` resolves resources, prevents path traversal, and auto-injects `window.modelflowBridge` into HTML. Plugin windows are subject to CSP restrictions (e.g. `connect-src 'none'`); internal fetch/xhr calls are limited.

### 10.5 Recommended: Use `window.modelflowBridge`

ModelFlow automatically injects `window.modelflowBridge` into plugin window HTML — no need to manually import the Tauri API:

```javascript
// Send a message to the plugin process
window.modelflowBridge.postMessage({ action: 'userClicked', data: 123 });

// Receive messages from the plugin process
window.modelflowBridge.onMessage((payload) => {
  console.log('Received from plugin process:', payload);
});

// Listen for theme changes
window.modelflowBridge.onThemeChange((theme) => {
  console.log('Theme changed:', theme.mode, theme.colors);
});
```

This bridge is compatible with both native Tauri environments and iframe embedded mode (falls back to `window.parent.postMessage`).

### 10.6 Window Events from Core

The window iframe can listen for the following events via the Tauri event API:

| Event | Payload | Description |
|-------|---------|-------------|
| `modelflow://window/created` | `WindowCreatedEvent` | Window was created |
| `modelflow://window/shown` | `WindowVisibilityEvent` | Window was shown |
| `modelflow://window/hidden` | `WindowVisibilityEvent` | Window was hidden |
| `modelflow://window/removed` | `WindowRemovedEvent` | Window was closed |
| `modelflow://window/postMessage` | `WindowPostMessageEvent` | Message from plugin process |
| `modelflow://window/themeChanged` | `ThemeChangedEvent` | Theme switch notification |

Example (inside a window):

```javascript
import { listen } from '@tauri-apps/api/event';

listen('modelflow://window/postMessage', (event) => {
  console.log('Received from plugin process:', event.payload);
});
```

### 10.7 Window → Plugin Process Messaging

The window calls the Tauri command `plugin_window_message`:

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

The plugin process receives on stdout:

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

### 10.8 Window Error Codes

| Code | Meaning |
|------|---------|
| `-32010` | Entry file missing or inaccessible |
| `-32011` | Window creation failed |
| `-32012` | Window already exists |
| `-32013` | Window not found |
| `-32014` | Missing `window` permission |
| `-32015` | WebView crashed |

---

## 11. Runtime Communication & Event Sources

Plugins can act as event sources for the ModelFlow AI OS Runtime, allowing Agents to respond to external messages in the background.

### 11.1 Declaring Event Sources

Add `eventSources` to `manifest.json`:

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

> **Note**: After declaring `eventSources`, the frontend (or CLI launch logic) must also call `sync_plugin_event_sources` to sync the configuration to the Rust `RuntimeState.plugin_poll_configs`. Only then will `PluginPollSource` begin polling.

| Field | Description |
|-------|-------------|
| `id` | Event source identifier, unique within the plugin |
| `type` | Currently only `poll` is supported |
| `tool` | MCP tool name called on each poll |
| `topic` | Default RuntimeEvent topic to emit |
| `interval` | Poll interval in seconds, default 60, minimum 5 |
| `pollArguments` | Static arguments passed to the tool on every poll |

### 11.2 Poll Tool Return Convention

Poll tools should return a message array in `result.metadata.messages`:

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [{ "type": "text", "text": "Fetched 2 new messages" }],
    "isError": false,
    "metadata": {
      "messages": [
        {
          "id": "msg-001",
          "topic": "message.received",
          "content": "Hello",
          "sender": "user1"
        }
      ]
    }
  }
}
```

Each message may contain:

| Field | Description |
|-------|-------------|
| `id` | Unique message identifier for deduplication; if absent, Core uses a hash of the message JSON |
| `topic` | Overrides the default topic; Core routes by this topic |
| `content` | Message body; Core may append openid/groupOpenid/msgId/msgSeq and reply instructions |
| `openid` / `groupOpenid` | Sender / group identifiers |
| `messageType` | e.g. `c2c` / `group` |
| `msgId` / `msgSeq` | Original message identifiers needed for passive replies |

> **Deduplication & state persistence**: Core uses a `DedupStore` scoped to `plugin_id:source_id`, persisted to `~/.ModelFlow/runtime/plugin_poll_seen.json`.

### 11.3 RuntimeEvent Routing

Core converts each new message into a `RuntimeEvent`:

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
    "content": "Received plugin message: Hello"
  },
  "timestamp": 1234567890,
  "priority": 45
}
```

Agents subscribed to `message.received` (or the wildcard `message.**`) will be dispatched accordingly.

### 11.4 Plugins Sending Runtime Events Proactively

A plugin can expose a tool (e.g. `emit_event`) that an Agent can call to indirectly trigger an event. Direct MCP extension notifications for event emission may be added in a future version.

---

## 12. Key Capabilities ModelFlow Provides for Plugins

With the appropriate permissions, plugins can leverage ModelFlow's following capabilities:

### 12.1 Unified Multi-Model Invocation

ModelFlow has built-in adapters for 25+ model providers. Plugins don't need to deal with provider-specific API differences. If a plugin needs model capabilities, it should expose tools for Agents to call, letting the Agent go through the Rust `LlmClient` or TS `streamChat`.

### 12.2 Tool Registration & Agent Loop

- Plugin tools are automatically merged into the Rust `ToolRegistry` and frontend `BUILTIN_TOOLS`.
- Agents can call multiple plugin tools in sequence across multiple rounds.
- Tool calls use XML `<tool_call>` format with automatic parameter validation.

### 12.3 Local System Capabilities

| Capability | Built-in Tool | How Plugin Can Trigger |
|------------|---------------|------------------------|
| Execute system commands | `execute_command` | Agent calls |
| Read/write files | `read_file` / `write_file` / `write_binary_file` | Agent calls |
| List directories | `list_directory` | Agent calls |
| SQLite queries | `db_query` | Agent calls |
| Web search | `search_web` / `search_brave` / `search_tavily` | Agent calls |
| Browser automation | `browser_*` family | Agent calls |

### 12.4 Context & Memory

- Agent instance context is persisted to `~/.ModelFlow/runtime/`.
- Long-term user memories are auto-injected into system messages.
- Plugins can supplement model context by returning `metadata`.

### 12.5 Workflows & Plans

- Workflow nodes can directly invoke plugin tools (`plugin` node).
- Task plans (Plan) can use plugins as step executors, or let Agents call plugin tools to complete steps.

### 12.6 Event Bus

- The EventBus supports dot-separated topics with `*` / `**` wildcard subscriptions.
- Plugin event sources, timers, and file changes can all act as event producers.

---

## 13. Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.0 | 2026-07-08 | Merged `PLUGIN_DEVELOPMENT_GUIDEV1.2.md` and `PLUGIN_PROTOCOL.md`, organized into a development guide |
| 1.2 | 2026-07-08 | Full codebase scan: annotated unimplemented fields/permissions, supplemented window Bridge/protocol/CSP/commands, event source sync & dedup, settings storage, uninstall API |

---

*Last updated: 2026-07-08 (full codebase scan: annotated unimplemented fields/permissions, supplemented window Bridge/protocol/CSP/commands, event source sync & dedup, settings storage, uninstall API)*
