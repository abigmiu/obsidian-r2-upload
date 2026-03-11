# Obsidian R2 Upload

一个支持桌面端/手机端的 Obsidian 插件：把本地图片上传到 Cloudflare R2，并在**等待图片压缩完成**（默认安静 2 秒）后再上传。

## 功能

- 📱 手机端可用：使用 `fetch + SigV4`，不依赖 Node-only SDK
- 🖱️ 右键/长按上传：文件管理器菜单中提供 “Upload to R2”
- ✍️ 自动上传：粘贴/拖拽插入图片后自动上传（不阻止 Obsidian 默认行为）
- ⏳ 等压缩完成：基于 `vault create/modify/rename` 事件 + 安静窗口（默认 2000ms），不做 `stat` 轮询
- 🔁 替换引用：上传后可替换当前笔记里的 `![[...]]` / `![](...)` 引用；支持 `![[img.png|300]]` 宽度转 HTML

## 配置

在插件设置里填写：

- Access Key ID / Secret Access Key（R2 API Token）
- Endpoint（R2 桶的 S3 API endpoint，可直接复制完整 URL）
- Bucket（如果 endpoint 已包含 bucket，也可以留空）
- Custom Domain（可选，不带 `https://`）
- Path Prefix（例如 `images/`，必须以 `/` 结尾）

## 开发

```bash
npm install
npm run dev
```

构建产物是仓库根目录的 `main.js`（`manifest.json` / `styles.css` 保持在根目录），发布时把这三个文件作为 Release 资产即可 📦
