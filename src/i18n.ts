export type SupportedLocale = "en" | "zh" | "ja";

type Params = Record<string, string | number | boolean | null | undefined>;

const STRINGS: Record<SupportedLocale, Record<string, string>> = {
  en: {
    "menu.upload_to_r2": "Upload to R2",

    "notice.waiting_stable": "waiting for image to stabilize…",
    "notice.uploading": "uploading…",
    "notice.done": "done ✅",
    "notice.already_queued": "already queued",
    "notice.uploaded_replace_failed": "uploaded, but failed to replace references (see console).",

    "settings.title": "Obsidian R2 Upload",
    "settings.section.r2": "R2 Settings",
    "settings.section.behavior": "Behavior",
    "settings.section.local": "Local file policy",

    "settings.r2.access_key_id": "Access Key ID",
    "settings.r2.secret_access_key": "Secret Access Key",
    "settings.r2.endpoint": "Endpoint (S3 API)",
    "settings.r2.endpoint_desc": "Example: https://<account>.r2.cloudflarestorage.com/<bucket>",
    "settings.r2.bucket": "Bucket",
    "settings.r2.bucket_desc": "Optional if your endpoint already includes /bucket-name in the path.",
    "settings.r2.custom_domain": "Custom Domain",
    "settings.r2.custom_domain_desc": "Optional. Without https://, e.g. images.example.com",
    "settings.r2.path_prefix": "Path Prefix",
    "settings.r2.path_prefix_desc": "Must end with /. Example: images/",

    "settings.behavior.auto_upload": "Auto upload on paste/drop",
    "settings.behavior.stable_window": "Stable window (ms)",
    "settings.behavior.stable_window_desc": "Wait until the file stops changing for this long. Default: {default}ms.",
    "settings.behavior.create_window": "Create window (ms)",
    "settings.behavior.create_window_desc": "After paste/drop, auto-upload images created within this time window. Default: {default}ms.",
    "settings.behavior.naming_strategy": "Naming strategy",
    "settings.behavior.naming_strategy_desc": "Default: UUID. Use content-hash if you want de-duplication.",
    "settings.behavior.replace_in_note": "Replace references in current note",
    "settings.behavior.copy_clipboard": "Copy URL to clipboard",

    "settings.local.after_upload": "After upload",
    "settings.local.keep": "Keep local file",
    "settings.local.delete": "Delete local file",
    "settings.local.move": "Move local file",
    "settings.local.move_target": "Move target folder",
    "settings.local.move_target_desc": 'Example: "_trash/". Folder will be created if missing.',

    "settings.option.uuid": "UUID (default)",
    "settings.option.content_hash": "Content hash",

    "err.r2.endpoint_required": "R2 endpoint is required",
    "err.r2.invalid_endpoint": "Invalid endpoint URL: {message}",
    "err.r2.access_required": "R2 accessKeyId/secretAccessKey are required",
    "err.r2.bucket_required": "Bucket is required (either in settings or in endpoint URL path)",
    "err.r2.path_prefix_format": "Path prefix must end with /",
    "err.r2.keys_maybe_swapped": "Access Key ID looks like a Secret Access Key. Did you swap the two fields?",
    "err.wait_timeout": "Timed out while waiting for compression to finish.",
    "err.file_still_changing": "File is still changing. Please try again.",
    "err.file_not_found": "File not found: {path}",
    "err.clipboard_unavailable": "Failed to copy URL to clipboard (clipboard API unavailable).",
    "err.network_failed_fetch": "Network error: Failed to fetch. Please check your endpoint, internet connection, and firewall/VPN.",
    "err.upload_http_failed": "Upload failed (HTTP {status}): {text}"
  },
  zh: {
    "menu.upload_to_r2": "上传到 R2",

    "notice.waiting_stable": "等待图片压缩完成…",
    "notice.uploading": "正在上传…",
    "notice.done": "完成 ✅",
    "notice.already_queued": "已在队列中",
    "notice.uploaded_replace_failed": "已上传，但替换引用失败（详见控制台）。",

    "settings.title": "Obsidian R2 Upload",
    "settings.section.r2": "R2 配置",
    "settings.section.behavior": "行为",
    "settings.section.local": "本地文件策略",

    "settings.r2.access_key_id": "Access Key ID",
    "settings.r2.secret_access_key": "Secret Access Key",
    "settings.r2.endpoint": "Endpoint（S3 API）",
    "settings.r2.endpoint_desc": "示例：https://<account>.r2.cloudflarestorage.com/<bucket>",
    "settings.r2.bucket": "Bucket",
    "settings.r2.bucket_desc": "如果 endpoint 已包含 /bucket-name，可留空。",
    "settings.r2.custom_domain": "自定义域名",
    "settings.r2.custom_domain_desc": "可选，不带 https://，例如 images.example.com",
    "settings.r2.path_prefix": "路径前缀",
    "settings.r2.path_prefix_desc": "必须以 / 结尾，例如 images/",

    "settings.behavior.auto_upload": "粘贴/拖拽后自动上传",
    "settings.behavior.stable_window": "稳定窗口（毫秒）",
    "settings.behavior.stable_window_desc": "文件在这段时间内无 modify/rename 事件则视为稳定。默认 {default}ms。",
    "settings.behavior.create_window": "创建窗口（毫秒）",
    "settings.behavior.create_window_desc": "粘贴/拖拽后在该时间内创建的图片会自动上传。默认 {default}ms。",
    "settings.behavior.naming_strategy": "命名策略",
    "settings.behavior.naming_strategy_desc": "默认 UUID；如需去重可选 content-hash。",
    "settings.behavior.replace_in_note": "替换当前笔记中的引用",
    "settings.behavior.copy_clipboard": "复制 URL 到剪贴板",

    "settings.local.after_upload": "上传后",
    "settings.local.keep": "保留本地文件",
    "settings.local.delete": "删除本地文件",
    "settings.local.move": "移动本地文件",
    "settings.local.move_target": "移动目标文件夹",
    "settings.local.move_target_desc": '示例："_trash/"。不存在会自动创建。',

    "settings.option.uuid": "UUID（默认）",
    "settings.option.content_hash": "内容哈希",

    "err.r2.endpoint_required": "必须填写 R2 endpoint",
    "err.r2.invalid_endpoint": "endpoint URL 无效：{message}",
    "err.r2.access_required": "必须填写 accessKeyId/secretAccessKey",
    "err.r2.bucket_required": "必须填写 bucket（或在 endpoint 路径中包含 bucket）",
    "err.r2.path_prefix_format": "路径前缀必须以 / 结尾",
    "err.r2.keys_maybe_swapped": "Access Key ID 看起来像 Secret Access Key，你是不是把两个字段填反了？",
    "err.wait_timeout": "等待压缩完成超时。",
    "err.file_still_changing": "文件仍在变化，请稍后重试。",
    "err.file_not_found": "找不到文件：{path}",
    "err.clipboard_unavailable": "复制失败（剪贴板 API 不可用）。",
    "err.network_failed_fetch": "网络错误：Failed to fetch。请检查 endpoint、网络连接，以及防火墙/VPN。",
    "err.upload_http_failed": "上传失败（HTTP {status}）：{text}"
  },
  ja: {
    "menu.upload_to_r2": "R2 にアップロード",

    "notice.waiting_stable": "圧縮完了を待機中…",
    "notice.uploading": "アップロード中…",
    "notice.done": "完了 ✅",
    "notice.already_queued": "キューに追加済み",
    "notice.uploaded_replace_failed": "アップロード済みですが、参照の置換に失敗しました（コンソール参照）。",

    "settings.title": "Obsidian R2 Upload",
    "settings.section.r2": "R2 設定",
    "settings.section.behavior": "動作",
    "settings.section.local": "ローカルファイル方針",

    "settings.r2.access_key_id": "Access Key ID",
    "settings.r2.secret_access_key": "Secret Access Key",
    "settings.r2.endpoint": "Endpoint（S3 API）",
    "settings.r2.endpoint_desc": "例：https://<account>.r2.cloudflarestorage.com/<bucket>",
    "settings.r2.bucket": "Bucket",
    "settings.r2.bucket_desc": "endpoint に /bucket-name が含まれる場合は省略可能です。",
    "settings.r2.custom_domain": "カスタムドメイン",
    "settings.r2.custom_domain_desc": "任意。https:// なし（例：images.example.com）",
    "settings.r2.path_prefix": "パスプレフィックス",
    "settings.r2.path_prefix_desc": "/ で終わる必要があります（例：images/）",

    "settings.behavior.auto_upload": "貼り付け/ドロップで自動アップロード",
    "settings.behavior.stable_window": "安定ウィンドウ（ms）",
    "settings.behavior.stable_window_desc": "この時間 modify/rename が無ければ安定とみなします。デフォルト {default}ms。",
    "settings.behavior.create_window": "作成ウィンドウ（ms）",
    "settings.behavior.create_window_desc": "貼り付け/ドロップ後、この時間内に作成された画像を自動アップロード。デフォルト {default}ms。",
    "settings.behavior.naming_strategy": "命名方式",
    "settings.behavior.naming_strategy_desc": "デフォルトは UUID。重複排除したい場合は content-hash。",
    "settings.behavior.replace_in_note": "現在のノート内参照を置換",
    "settings.behavior.copy_clipboard": "URL をクリップボードにコピー",

    "settings.local.after_upload": "アップロード後",
    "settings.local.keep": "ローカルに保持",
    "settings.local.delete": "ローカルを削除",
    "settings.local.move": "ローカルを移動",
    "settings.local.move_target": "移動先フォルダ",
    "settings.local.move_target_desc": '例："_trash/"。存在しない場合は作成されます。',

    "settings.option.uuid": "UUID（デフォルト）",
    "settings.option.content_hash": "内容ハッシュ",

    "err.r2.endpoint_required": "R2 endpoint は必須です",
    "err.r2.invalid_endpoint": "endpoint URL が無効です：{message}",
    "err.r2.access_required": "accessKeyId/secretAccessKey は必須です",
    "err.r2.bucket_required": "bucket が必要です（設定または endpoint のパス）",
    "err.r2.path_prefix_format": "パスプレフィックスは / で終わる必要があります",
    "err.r2.keys_maybe_swapped": "Access Key ID が Secret Access Key のようです。2つの欄を入れ替えていませんか？",
    "err.wait_timeout": "圧縮完了の待機がタイムアウトしました。",
    "err.file_still_changing": "ファイルがまだ変更中です。しばらくしてから再試行してください。",
    "err.file_not_found": "ファイルが見つかりません：{path}",
    "err.clipboard_unavailable": "コピーに失敗しました（クリップボード API が利用できません）。",
    "err.network_failed_fetch": "ネットワークエラー：Failed to fetch。endpoint、回線、Firewall/VPN を確認してください。",
    "err.upload_http_failed": "アップロード失敗（HTTP {status}）：{text}"
  }
};

export function resolveLocale(rawLocale: string | undefined | null): SupportedLocale {
  const v = (rawLocale ?? "").toLowerCase();
  if (v.startsWith("zh")) return "zh";
  if (v.startsWith("ja")) return "ja";
  return "en";
}

export function t(locale: SupportedLocale, key: string, params?: Params): string {
  const template = STRINGS[locale][key] ?? STRINGS.en[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_m, name: string) => {
    const value = params[name];
    return value === undefined || value === null ? "" : String(value);
  });
}
