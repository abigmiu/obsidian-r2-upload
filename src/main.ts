import {
  App,
  Editor,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TAbstractFile,
  TFile,
  Menu,
  normalizePath
} from "obsidian";
import { moment } from "obsidian";

import { R2Client, type R2Config } from "./r2";
import { StableFileTracker } from "./stability";
import {
  buildUploadKey,
  ensureFolderExists,
  guessContentType,
  isImageFile,
  makeUuid,
  sanitizeBaseName
} from "./utils";
import { replaceImageReferencesInNote } from "./replace";
import { resolveLocale, t as translate, type SupportedLocale } from "./i18n";
import { isLocalizedError, LocalizedError } from "./errors";

const PLUGIN_NAME = "Obsidian R2 Upload";

type NamingStrategy = "uuid" | "content-hash";
type LocalFilePolicy = "keep" | "delete" | "move";

interface R2UploadSettings {
  r2: R2Config;
  enableAutoUpload: boolean;
  createWindowMs: number;
  stableForMs: number;
  namingStrategy: NamingStrategy;
  localFilePolicy: LocalFilePolicy;
  moveTargetFolder: string;
  copyUrlToClipboard: boolean;
  replaceInCurrentNote: boolean;
}

const DEFAULT_SETTINGS: R2UploadSettings = {
  r2: {
    accessKeyId: "",
    secretAccessKey: "",
    endpoint: "",
    bucket: "",
    customDomain: "",
    pathPrefix: "images/"
  },
  enableAutoUpload: true,
  createWindowMs: 5000,
  stableForMs: 2000,
  namingStrategy: "uuid",
  localFilePolicy: "keep",
  moveTargetFolder: "_trash/",
  copyUrlToClipboard: true,
  replaceInCurrentNote: true
};

type PendingContext = {
  notePath: string;
  deadlineAt: number;
  remaining: number;
};

type UploadTask = {
  id: string;
  path: string;
  previousPaths: string[];
  notePath?: string;
  enqueuedAt: number;
};

export default class ObsidianR2UploadPlugin extends Plugin {
  settings: R2UploadSettings;

  private r2Client: R2Client | null = null;
  private stableTracker = new StableFileTracker();
  private locale: SupportedLocale = "en";

  private pendingContexts: PendingContext[] = [];
  private uploadTasksByPath = new Map<string, UploadTask>();
  private inflightByTaskId = new Map<string, Promise<void>>();

  async onload() {
    await this.loadSettings();
    this.locale = resolveLocale(moment.locale());
    this.addSettingTab(new R2UploadSettingTab(this.app, this));

    this.registerVaultStabilityEvents();
    this.registerAutoUploadEvents();
    this.registerFileMenu();
    this.registerFilesMenu();
    this.registerEditorMenu();
    this.registerCommands();

    this.tryInitClient();
  }

  onunload() {
    this.pendingContexts = [];
    this.uploadTasksByPath.clear();
    this.inflightByTaskId.clear();
  }

  private tryInitClient() {
    try {
      const { r2 } = this.settings;
      this.r2Client = new R2Client(r2);
    } catch (err) {
      const message = this.formatError(err);
      new Notice(`${PLUGIN_NAME}: ${message}`, 8000);
      this.r2Client = null;
    }
  }

  private registerVaultStabilityEvents() {
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (file instanceof TFile && isImageFile(file.name)) {
          this.stableTracker.noteChange(file.path);
        }
      })
    );
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof TFile && isImageFile(file.name)) {
          this.stableTracker.noteChange(file.path);
        }
      })
    );
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (file instanceof TFile && isImageFile(file.name)) {
          this.stableTracker.migratePath(oldPath, file.path);
          this.migrateQueuedTaskPath(oldPath, file.path);
        }
      })
    );
  }

  private registerAutoUploadEvents() {
    this.registerEvent(
      this.app.workspace.on("editor-paste", (evt: ClipboardEvent, _editor: Editor) => {
        if (!this.settings.enableAutoUpload) return;
        if (!evt.clipboardData) return;

        const imageCount = Array.from(evt.clipboardData.items).filter((item) => item.type.startsWith("image/")).length;
        if (imageCount <= 0) return;

        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || activeFile.extension !== "md") return;

        this.recordPendingContext(activeFile.path, imageCount);
      })
    );

    this.registerEvent(
      this.app.workspace.on("editor-drop", (evt: DragEvent, _editor: Editor) => {
        if (!this.settings.enableAutoUpload) return;
        if (!evt.dataTransfer) return;

        const imageCount = Array.from(evt.dataTransfer.files).filter((f) => f.type.startsWith("image/") || isImageFile(f.name)).length;
        if (imageCount <= 0) return;

        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || activeFile.extension !== "md") return;

        this.recordPendingContext(activeFile.path, imageCount);
      })
    );

    this.registerEvent(
      this.app.vault.on("create", (file: TAbstractFile) => {
        if (!this.settings.enableAutoUpload) return;
        if (!(file instanceof TFile)) return;
        if (!isImageFile(file.name)) return;

        const notePath = this.consumeBestPendingContext();
        if (!notePath) return;

        void this.enqueueUpload(file.path, notePath);
      })
    );
  }

  private registerFileMenu() {
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (!(file instanceof TFile)) return;
        if (!isImageFile(file.name)) return;

        menu.addItem((item) => {
          item
            .setTitle(this.tr("menu.upload_to_r2"))
            .setIcon("upload")
            .onClick(() => {
              const activeNote = this.app.workspace.getActiveFile();
              const notePath = activeNote?.extension === "md" ? activeNote.path : undefined;
              void this.enqueueUpload(file.path, notePath);
            });
        });
      })
    );
  }

  private registerFilesMenu() {
    this.registerEvent(
      this.app.workspace.on("files-menu", (menu, files) => {
        const imageFiles = files.filter((f): f is TFile => f instanceof TFile && isImageFile(f.name));
        if (imageFiles.length === 0) return;

        menu.addItem((item) => {
          item
            .setTitle(this.tr("menu.upload_selected_images"))
            .setIcon("upload")
            .onClick(() => {
              const activeNote = this.app.workspace.getActiveFile();
              const notePath = activeNote?.extension === "md" ? activeNote.path : undefined;
              void this.enqueueMultipleUploads(imageFiles.map((f) => f.path), notePath);
            });
        });
      })
    );
  }

  private registerEditorMenu() {
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu: Menu, editor: Editor, info) => {
        const sourcePath = (info as any)?.file?.path ?? this.app.workspace.getActiveFile()?.path;
        if (!sourcePath) return;

        const linked = this.findLinkedImageAtCursor(editor, sourcePath);
        if (!linked) return;

        menu.addItem((item) => {
          item
            .setTitle(this.tr("menu.upload_linked_image"))
            .setIcon("upload")
            .onClick(() => {
              void this.enqueueUpload(linked.file.path, sourcePath);
            });
        });
      })
    );
  }

  private registerCommands() {
    this.addCommand({
      id: "upload-image-at-cursor",
      name: this.tr("menu.upload_linked_image"),
      editorCallback: (editor, view) => {
        const sourcePath = (view as any)?.file?.path ?? this.app.workspace.getActiveFile()?.path;
        if (!sourcePath) return;
        const linked = this.findLinkedImageAtCursor(editor, sourcePath);
        if (!linked) {
          new Notice(`${PLUGIN_NAME}: ${this.tr("notice.no_image_at_cursor")}`, 2500);
          return;
        }
        void this.enqueueUpload(linked.file.path, sourcePath);
      }
    });
  }

  private async enqueueMultipleUploads(paths: string[], notePath?: string) {
    if (paths.length === 0) {
      new Notice(`${PLUGIN_NAME}: ${this.tr("notice.no_images_selected")}`, 2500);
      return;
    }
    for (const p of paths) {
      // sequential to keep notices and stability waits understandable
      await this.enqueueUpload(p, notePath);
    }
  }

  private findLinkedImageAtCursor(editor: Editor, sourcePath: string): { file: TFile; rawTarget: string } | null {
    const selection = editor.getSelection()?.trim();
    const cursor = editor.getCursor();
    const line = editor.getLine(cursor.line);

    const candidate = this.extractFirstImageTarget(selection) ?? this.extractImageTargetInLine(line, cursor.ch);
    if (!candidate) return null;

    if (/^[a-z]+:\/\//i.test(candidate)) return null;

    const file = this.app.metadataCache.getFirstLinkpathDest(candidate, sourcePath);
    if (!file) return null;
    if (!isImageFile(file.name)) return null;
    return { file, rawTarget: candidate };
  }

  private extractImageTargetInLine(line: string, cursorCh: number): string | null {
    const matches: { start: number; end: number; target: string }[] = [];

    for (const m of line.matchAll(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      matches.push({ start, end, target: normalizeLinkTarget(m[1]) });
    }
    for (const m of line.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      matches.push({ start, end, target: normalizeLinkTarget(m[1]) });
    }

    if (matches.length === 0) return null;
    const inRange = matches.find((x) => cursorCh >= x.start && cursorCh <= x.end);
    return (inRange ?? matches[0]).target;
  }

  private extractFirstImageTarget(text: string | undefined): string | null {
    if (!text) return null;
    const wiki = text.match(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
    if (wiki) return normalizeLinkTarget(wiki[1]);
    const md = text.match(/!\[[^\]]*\]\(([^)]+)\)/);
    if (md) return normalizeLinkTarget(md[1]);
    return null;
  }

  private recordPendingContext(notePath: string, remaining: number) {
    const now = Date.now();
    const deadlineAt = now + this.settings.createWindowMs;
    this.pendingContexts.push({ notePath, deadlineAt, remaining });
    this.pendingContexts = this.pendingContexts.filter((c) => c.deadlineAt >= now);
  }

  private consumeBestPendingContext(): string | null {
    const now = Date.now();
    this.pendingContexts = this.pendingContexts.filter((c) => c.deadlineAt >= now);
    if (this.pendingContexts.length === 0) return null;
    const bestIndex = this.pendingContexts.length - 1;
    const best = this.pendingContexts[bestIndex];
    best.remaining -= 1;
    if (best.remaining <= 0) {
      this.pendingContexts.splice(bestIndex, 1);
    }
    return best.notePath;
  }

  private migrateQueuedTaskPath(oldPath: string, newPath: string) {
    const task = this.uploadTasksByPath.get(oldPath);
    if (!task) return;
    this.uploadTasksByPath.delete(oldPath);
    task.previousPaths.push(oldPath);
    task.path = newPath;
    this.uploadTasksByPath.set(newPath, task);
  }

  private async enqueueUpload(path: string, notePath?: string) {
    const normalizedPath = normalizePath(path);
    const existing = this.uploadTasksByPath.get(normalizedPath);
    if (existing) {
      if (notePath && !existing.notePath) existing.notePath = notePath;
      new Notice(`${PLUGIN_NAME}: ${this.tr("notice.already_queued")}`, 1500);
      return;
    }

    const task: UploadTask = {
      id: makeUuid(),
      path: normalizedPath,
      previousPaths: [],
      notePath,
      enqueuedAt: Date.now()
    };

    this.uploadTasksByPath.set(task.path, task);
    const promise = this.runUploadTask(task).finally(() => {
      this.inflightByTaskId.delete(task.id);
      this.uploadTasksByPath.delete(task.path);
    });
    this.inflightByTaskId.set(task.id, promise);
    await promise;
  }

  private getClientOrThrow(): R2Client {
    if (!this.r2Client) {
      this.tryInitClient();
    }
    if (!this.r2Client) {
      throw new Error("R2 config missing/invalid. Please configure the plugin settings.");
    }
    return this.r2Client;
  }

  private async runUploadTask(task: UploadTask) {
    try {
      const client = this.getClientOrThrow();

      new Notice(`${PLUGIN_NAME}: ${this.tr("notice.waiting_stable")}`, 1500);
      await this.stableTracker.waitUntilStable(() => task.path, this.settings.stableForMs, 30000);

      const { file, bytes } = await this.readStableBinary(task);

      const key = await buildUploadKey({
        file,
        bytes,
        namingStrategy: this.settings.namingStrategy,
        pathPrefix: client.getPathPrefix(),
        uuid: makeUuid,
        sanitizeBaseName
      });

      const contentType = guessContentType(file.name);

      new Notice(`${PLUGIN_NAME}: ${this.tr("notice.uploading")}`, 1500);
      const url = await client.putObject({
        bucket: client.getBucket(),
        key,
        body: bytes,
        contentType
      });

      if (this.settings.copyUrlToClipboard) {
        try {
          await this.copyToClipboard(url);
        } catch (err) {
          const message = this.formatError(err);
          new Notice(`${PLUGIN_NAME}: ${message}`, 4000);
        }
      }

      if (this.settings.replaceInCurrentNote && task.notePath) {
        try {
          await replaceImageReferencesInNote(this.app, task.notePath, [task.path, ...task.previousPaths], url);
        } catch (err) {
          console.warn(`${PLUGIN_NAME}: failed to replace references`, err);
          new Notice(`${PLUGIN_NAME}: ${this.tr("notice.uploaded_replace_failed")}`, 6000);
        }
      }

      await this.applyLocalFilePolicy(file);

      new Notice(`${PLUGIN_NAME}: ${this.tr("notice.done")}`, 2000);
    } catch (err) {
      console.error(`${PLUGIN_NAME}: upload failed`, err);
      const message = this.formatError(err);
      new Notice(`${PLUGIN_NAME}: ${message}`, 9000);
    }
  }

  private async readStableBinary(task: UploadTask): Promise<{ file: TFile; bytes: ArrayBuffer }> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const path = task.path;
      const file = this.getFileOrThrow(path);
      const before = this.stableTracker.getLastChangeAt(path);

      const bytes = await this.app.vault.readBinary(file);

      const after = this.stableTracker.getLastChangeAt(task.path);
      if (after === before) {
        return { file, bytes };
      }

      await this.stableTracker.waitUntilStable(() => task.path, this.settings.stableForMs, 30000);
    }
    throw this.localizedError("err.file_still_changing");
  }

  private getFileOrThrow(path: string): TFile {
    const abstract = this.app.vault.getAbstractFileByPath(path);
    if (!(abstract instanceof TFile)) throw this.localizedError("err.file_not_found", { path });
    return abstract;
  }

  private async copyToClipboard(text: string) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
      }
    } catch {
      // ignore and fallback
    }
    throw this.localizedError("err.clipboard_unavailable");
  }

  private async applyLocalFilePolicy(file: TFile) {
    const policy = this.settings.localFilePolicy;
    if (policy === "keep") return;

    if (policy === "delete") {
      await this.app.vault.delete(file);
      return;
    }

    const folder = normalizePath(this.settings.moveTargetFolder || "_trash/");
    const folderPath = folder.endsWith("/") ? folder.slice(0, -1) : folder;
    await ensureFolderExists(this.app, folderPath);

    const baseName = file.basename;
    const ext = file.extension;
    let targetPath = normalizePath(`${folderPath}/${file.name}`);
    let counter = 1;
    while (this.app.vault.getAbstractFileByPath(targetPath)) {
      const suffix = `-${counter++}`;
      targetPath = normalizePath(`${folderPath}/${baseName}${suffix}.${ext}`);
    }
    await this.app.vault.rename(file, targetPath);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.tryInitClient();
  }

  tr(key: string, params?: Record<string, any>): string {
    return translate(this.locale, key, params);
  }

  localizedError(key: string, params?: Record<string, any>): Error {
    return new LocalizedError(key, params, this.tr(key, params));
  }

  private formatError(err: unknown): string {
    if (isLocalizedError(err)) {
      return this.tr(err.key, err.params);
    }
    if (err instanceof Error) return err.message;
    return String(err);
  }
}

function normalizeLinkTarget(raw: string): string {
  const trimmed = raw.trim();
  const withoutAngles = trimmed.startsWith("<") && trimmed.endsWith(">") ? trimmed.slice(1, -1) : trimmed;
  const withoutFragment = withoutAngles.split("#")[0];
  try {
    return decodeURIComponent(withoutFragment);
  } catch {
    return withoutFragment;
  }
}

class R2UploadSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: ObsidianR2UploadPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: this.plugin.tr("settings.title") });

    containerEl.createEl("h3", { text: this.plugin.tr("settings.section.r2") });
    const r2 = this.plugin.settings.r2;

    new Setting(containerEl)
      .setName(this.plugin.tr("settings.r2.access_key_id"))
      .addText((text) =>
        text.setValue(r2.accessKeyId).onChange(async (value) => {
          r2.accessKeyId = value.trim();
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(this.plugin.tr("settings.r2.secret_access_key"))
      .addText((text) => {
        text.inputEl.type = "password";
        text.setValue(r2.secretAccessKey).onChange(async (value) => {
          r2.secretAccessKey = value.trim();
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName(this.plugin.tr("settings.r2.endpoint"))
      .setDesc(this.plugin.tr("settings.r2.endpoint_desc"))
      .addText((text) =>
        text.setPlaceholder("https://<id>.r2.cloudflarestorage.com/bucket-name").setValue(r2.endpoint).onChange(async (value) => {
          r2.endpoint = value.trim();
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(this.plugin.tr("settings.r2.bucket"))
      .setDesc(this.plugin.tr("settings.r2.bucket_desc"))
      .addText((text) =>
        text.setValue(r2.bucket).onChange(async (value) => {
          r2.bucket = value.trim();
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(this.plugin.tr("settings.r2.custom_domain"))
      .setDesc(this.plugin.tr("settings.r2.custom_domain_desc"))
      .addText((text) =>
        text.setValue(r2.customDomain).onChange(async (value) => {
          r2.customDomain = value.trim();
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(this.plugin.tr("settings.r2.path_prefix"))
      .setDesc(this.plugin.tr("settings.r2.path_prefix_desc"))
      .addText((text) =>
        text.setValue(r2.pathPrefix).onChange(async (value) => {
          r2.pathPrefix = value.trim();
          await this.plugin.saveSettings();
        })
      );

    containerEl.createEl("h3", { text: this.plugin.tr("settings.section.behavior") });

    new Setting(containerEl)
      .setName(this.plugin.tr("settings.behavior.auto_upload"))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.enableAutoUpload).onChange(async (value) => {
          this.plugin.settings.enableAutoUpload = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(this.plugin.tr("settings.behavior.stable_window"))
      .setDesc(this.plugin.tr("settings.behavior.stable_window_desc", { default: 2000 }))
      .addText((text) =>
        text.setValue(String(this.plugin.settings.stableForMs)).onChange(async (value) => {
          const ms = Number(value);
          if (!Number.isFinite(ms) || ms < 0) return;
          this.plugin.settings.stableForMs = ms;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(this.plugin.tr("settings.behavior.create_window"))
      .setDesc(this.plugin.tr("settings.behavior.create_window_desc", { default: 5000 }))
      .addText((text) =>
        text.setValue(String(this.plugin.settings.createWindowMs)).onChange(async (value) => {
          const ms = Number(value);
          if (!Number.isFinite(ms) || ms < 0) return;
          this.plugin.settings.createWindowMs = ms;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(this.plugin.tr("settings.behavior.naming_strategy"))
      .setDesc(this.plugin.tr("settings.behavior.naming_strategy_desc"))
      .addDropdown((dropdown) =>
        dropdown
          .addOption("uuid", this.plugin.tr("settings.option.uuid"))
          .addOption("content-hash", this.plugin.tr("settings.option.content_hash"))
          .setValue(this.plugin.settings.namingStrategy)
          .onChange(async (value) => {
            this.plugin.settings.namingStrategy = value as NamingStrategy;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(this.plugin.tr("settings.behavior.replace_in_note"))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.replaceInCurrentNote).onChange(async (value) => {
          this.plugin.settings.replaceInCurrentNote = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(this.plugin.tr("settings.behavior.copy_clipboard"))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.copyUrlToClipboard).onChange(async (value) => {
          this.plugin.settings.copyUrlToClipboard = value;
          await this.plugin.saveSettings();
        })
      );

    containerEl.createEl("h3", { text: this.plugin.tr("settings.section.local") });
    new Setting(containerEl)
      .setName(this.plugin.tr("settings.local.after_upload"))
      .addDropdown((dropdown) =>
        dropdown
          .addOption("keep", this.plugin.tr("settings.local.keep"))
          .addOption("delete", this.plugin.tr("settings.local.delete"))
          .addOption("move", this.plugin.tr("settings.local.move"))
          .setValue(this.plugin.settings.localFilePolicy)
          .onChange(async (value) => {
            this.plugin.settings.localFilePolicy = value as LocalFilePolicy;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    if (this.plugin.settings.localFilePolicy === "move") {
      new Setting(containerEl)
        .setName(this.plugin.tr("settings.local.move_target"))
        .setDesc(this.plugin.tr("settings.local.move_target_desc"))
        .addText((text) =>
          text.setValue(this.plugin.settings.moveTargetFolder).onChange(async (value) => {
            this.plugin.settings.moveTargetFolder = value.trim();
            await this.plugin.saveSettings();
          })
        );
    }
  }
}
