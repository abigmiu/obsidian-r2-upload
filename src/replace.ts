import { App, TFile } from "obsidian";

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

function pathVariants(paths: string[]): Set<string> {
  const set = new Set<string>();
  for (const p of paths) {
    set.add(p);
    const withoutExt = p.replace(/\.[^/.]+$/, "");
    set.add(withoutExt);
    const base = p.split("/").pop() ?? p;
    set.add(base);
    set.add(base.replace(/\.[^/.]+$/, ""));
  }
  return set;
}

function isMatchTarget(target: string, variants: Set<string>): boolean {
  if (variants.has(target)) return true;
  const normalized = target.replace(/^\.\/+/, "");
  if (variants.has(normalized)) return true;
  const base = normalized.split("/").pop() ?? normalized;
  if (variants.has(base)) return true;
  const baseNoExt = base.replace(/\.[^/.]+$/, "");
  if (variants.has(baseNoExt)) return true;
  return false;
}

function renderReplacement(url: string, pipe: string | undefined): string {
  if (!pipe) return `![](${url})`;

  const raw = pipe.trim();
  const m = raw.match(/^(\d+)(?:x(\d+))?$/i);
  if (m) {
    const width = m[1];
    const height = m[2];
    if (height) return `<img src="${url}" width="${width}" height="${height}">`;
    return `<img src="${url}" width="${width}">`;
  }
  const alt = raw.replace(/\r?\n/g, " ").trim();
  if (!alt) return `![](${url})`;
  return `![${escapeMarkdownAlt(alt)}](${url})`;
}

function escapeMarkdownAlt(alt: string): string {
  return alt.replace(/[\[\]]/g, "\\$&");
}

export async function replaceImageReferencesInNote(app: App, notePath: string, localPaths: string[], url: string): Promise<void> {
  const abstract = app.vault.getAbstractFileByPath(notePath);
  if (!(abstract instanceof TFile)) return;
  if (abstract.extension !== "md") return;

  const variants = pathVariants(localPaths);

  await app.vault.process(abstract, (text) => {
    let next = text;

    // Wiki embeds: ![[path|...]]
    next = next.replace(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, rawTarget: string, pipe: string | undefined) => {
      const target = normalizeLinkTarget(rawTarget);
      if (!isMatchTarget(target, variants)) return _m;
      return renderReplacement(url, pipe);
    });

    // Markdown images: ![alt](dest)
    next = next.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt: string, rawDest: string) => {
      const dest = normalizeLinkTarget(rawDest);
      if (!isMatchTarget(dest, variants)) return _m;
      const safeAlt = alt ?? "";
      return `![${safeAlt}](${url})`;
    });

    return next;
  });
}
