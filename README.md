# Obsidian R2 Upload

Upload images to Cloudflare R2 from Obsidian (desktop & mobile).

## Features

- Upload from file menu (desktop right-click / mobile long-press)
- Auto upload after paste/drop
- Waits for compression to finish (no `stat` polling; uses Obsidian `vault` events + stable window)
- Replace references in the current note
- i18n: English / 中文 / 日本語

## Build

```bash
npm install
npm run build
```

Release assets: `main.js`, `manifest.json`, `styles.css`.

