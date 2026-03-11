import { AwsClient } from "aws4fetch";
import { requestUrl } from "obsidian";
import { LocalizedError } from "./errors";

export interface R2Config {
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  bucket: string;
  customDomain: string;
  pathPrefix: string;
}

type ParsedEndpoint = {
  baseEndpoint: string;
  bucketFromEndpoint: string | null;
};

function parseR2Endpoint(endpoint: string): ParsedEndpoint {
  if (!endpoint) throw new LocalizedError("err.r2.endpoint_required");
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new LocalizedError("err.r2.invalid_endpoint", { message });
  }
  if (!url.protocol.startsWith("http")) {
    throw new LocalizedError("err.r2.invalid_endpoint", { message: "Endpoint must start with http:// or https://" });
  }

  const pathParts = url.pathname.split("/").filter(Boolean);
  const bucketFromEndpoint = pathParts.length > 0 ? pathParts[0] : null;
  url.pathname = "";
  url.search = "";
  url.hash = "";
  const baseEndpoint = url.toString().replace(/\/$/, "");

  return { baseEndpoint, bucketFromEndpoint };
}

export class R2Client {
  private aws: AwsClient;
  private parsed: ParsedEndpoint;

  constructor(private config: R2Config) {
    if (!config.accessKeyId || !config.secretAccessKey) {
      throw new LocalizedError("err.r2.access_required");
    }
    // Common misconfiguration: fields swapped (AWS secret keys are often 40 chars and contain /+=).
    if (looksLikeSecretKey(config.accessKeyId) && !looksLikeSecretKey(config.secretAccessKey)) {
      throw new LocalizedError("err.r2.keys_maybe_swapped");
    }
    this.parsed = parseR2Endpoint(config.endpoint);
    const bucket = this.getBucket();
    if (!bucket) {
      throw new LocalizedError("err.r2.bucket_required");
    }
    if (!config.pathPrefix || !config.pathPrefix.endsWith("/")) {
      throw new LocalizedError("err.r2.path_prefix_format");
    }

    this.aws = new AwsClient({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      region: "auto",
      service: "s3"
    });
  }

  getBucket(): string {
    return this.parsed.bucketFromEndpoint || this.config.bucket;
  }

  getPathPrefix(): string {
    return this.config.pathPrefix;
  }

  private buildObjectUrl(bucket: string, key: string): string {
    return `${this.parsed.baseEndpoint}/${bucket}/${key}`;
  }

  getPublicUrl(bucket: string, key: string): string {
    if (this.config.customDomain) {
      return `https://${this.config.customDomain}/${key}`;
    }
    return this.buildObjectUrl(bucket, key);
  }

  async putObject(opts: { bucket: string; key: string; body: ArrayBuffer; contentType?: string }): Promise<string> {
    const url = this.buildObjectUrl(opts.bucket, opts.key);
    const headers: Record<string, string> = {
      ...(opts.contentType ? { "Content-Type": opts.contentType } : {})
    };

    // Use aws4fetch to sign headers, but send via Obsidian requestUrl to avoid CORS issues (desktop & mobile).
    let signed: Request;
    try {
      signed = await this.aws.sign(url, { method: "PUT", headers, body: opts.body });
    } catch (err) {
      throw err;
    }

    const signedHeaders = headersToRecord(signed.headers);

    try {
      const res = await requestUrl({
        url,
        method: "PUT",
        headers: signedHeaders,
        body: opts.body,
        throw: false
      });
      if (res.status >= 400) {
        const parsed = parseS3ErrorXml(res.text || "");
        const text = parsed ? `${parsed.code}: ${parsed.message}` : (res.text || "");
        if (parsed?.code === "InvalidArgument" && /access key has length\s+40/i.test(parsed.message)) {
          throw new LocalizedError("err.r2.keys_maybe_swapped");
        }
        throw new LocalizedError("err.upload_http_failed", { status: res.status, text });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/failed to fetch/i.test(msg) || /network request failed/i.test(msg)) {
        throw new LocalizedError("err.network_failed_fetch");
      }
      throw err;
    }

    return this.getPublicUrl(opts.bucket, opts.key);
  }
}

function headersToRecord(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

function looksLikeSecretKey(value: string): boolean {
  const v = (value ?? "").trim();
  if (v.length === 40 && /[\/+=]/.test(v)) return true;
  if (v.length >= 40 && /[\/+=]/.test(v)) return true;
  return false;
}

function parseS3ErrorXml(xmlText: string): { code: string; message: string } | null {
  const xml = xmlText.trim();
  if (!xml.startsWith("<")) return null;
  const code = xml.match(/<Code>([^<]+)<\/Code>/i)?.[1]?.trim();
  const message = xml.match(/<Message>([^<]+)<\/Message>/i)?.[1]?.trim();
  if (!code || !message) return null;
  return { code, message };
}
