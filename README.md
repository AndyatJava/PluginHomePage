# ModelFlow Plugin Homepage

A static GitHub Pages site for browsing and managing ModelFlow plugins — both official verified plugins and community submissions.

## Live Site

Visit: `https://modelflow-app.github.io/PluginHomePage/` (configure after enabling GitHub Pages)

## What is this?

ModelFlow is a cross-platform desktop app that unifies multiple AI models in one local-first workspace. This repository hosts the plugin marketplace homepage where users and developers can:

- Browse official and community plugins
- Search and filter by category and type
- View plugin details: tools, permissions, settings, windows, event sources
- Get install instructions
- Link to the plugin development guide

## Project Structure

```
PluginHomePage/
├── index.html                    # Site entry
├── data/
│   └── plugins.json              # Plugin metadata
├── assets/
│   ├── css/style.css             # Styling
│   └── js/app.js                 # Interactivity
├── PLUGIN_DEVELOPMENT_GUIDEV1.2.md  # Plugin development guide
├── _config.yml                   # GitHub Pages config (disable Jekyll)
└── README.md                     # This file
```

## Local Preview

Because the app uses `fetch()` to load `data/plugins.json`, open the page via a local server instead of double-clicking the file:

```bash
# Python 3
python -m http.server 8080

# Node.js
npx serve .

# Then open http://localhost:8080
```

## Adding or Updating Plugins

Edit `data/plugins.json` and add an entry matching the existing schema:

```json
{
  "id": "com.example.myplugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "author": "Your Name",
  "type": "community",
  "category": "productivity",
  "description": "Short description.",
  "tags": ["tag1", "tag2"],
  "repo": "https://github.com/...",
  "downloadUrl": "https://github.com/.../releases/download/.../com.example.myplugin.zip",
  "permissions": [{ "type": "network", "allowedHosts": ["*"] }],
  "tools": [{ "name": "my_tool", "description": "Does something" }],
  "settings": [{ "key": "apiKey", "label": "API Key", "type": "password", "required": true }]
}
```

## Deploy to GitHub Pages

1. Push this repository to GitHub.
2. Go to **Settings → Pages**.
3. Select **Deploy from a branch** and choose `main` / `root`.
4. GitHub will serve `index.html` at your Pages URL.

## Contributing

For plugin development, see [PLUGIN_DEVELOPMENT_GUIDEV1.2.md](./PLUGIN_DEVELOPMENT_GUIDEV1.2.md).

For the main ModelFlow app, visit [ModelFlow-App/multi-agent-platform](https://github.com/ModelFlow-App/multi-agent-platform).
