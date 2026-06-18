import { readFile } from "node:fs/promises";
import { imageSize } from "image-size";
import { ValidationError } from "./types.js";

/** Intrinsic facts about a fetched screenshot, measured from its header. */
export interface ImageMeta {
  format: "png" | "jpeg" | "webp";
  width: number;
  height: number;
  byteLength: number;
}

/** Bounds a screenshot must satisfy. See DEFAULT_IMAGE_LIMITS for the values. */
export interface ImageLimits {
  /** Hard cap on bytes downloaded; the fetch is aborted past this. */
  maxBytes: number;
  /** Max width or height in pixels. */
  maxEdge: number;
  /** Max total pixels (width * height) — guards against decompression bombs. */
  maxPixels: number;
  /** Abort the fetch after this many milliseconds. */
  timeoutMs: number;
}

export const DEFAULT_IMAGE_LIMITS: ImageLimits = {
  maxBytes: 5 * 1024 * 1024,
  maxEdge: 4096,
  maxPixels: 25_000_000,
  timeoutMs: 15_000,
};

/** image-size reports JPEG as "jpg"; map its type ids to our supported formats. */
const SUPPORTED_FORMATS: Record<string, ImageMeta["format"]> = {
  png: "png",
  jpg: "jpeg",
  webp: "webp",
};

/** Canonical file extension for an ingested screenshot of the given format. */
export function extForFormat(format: ImageMeta["format"]): "png" | "jpg" | "webp" {
  return format === "jpeg" ? "jpg" : format;
}

/**
 * Measure an in-memory image buffer: confirm it is one of the supported
 * formats (PNG/JPEG/WebP) and read its intrinsic dimensions from the header.
 * Pure — no I/O. Throws ValidationError for unsupported or corrupt input.
 */
export function sniffAndMeasure(buf: Buffer): ImageMeta {
  let result: { width?: number; height?: number; type?: string };
  try {
    result = imageSize(buf);
  } catch {
    throw new ValidationError("screenshot is not a supported image (expected PNG, JPEG, or WebP)");
  }

  const format = result.type ? SUPPORTED_FORMATS[result.type] : undefined;
  if (format === undefined) {
    throw new ValidationError(
      `screenshot has unsupported image format "${result.type ?? "unknown"}" ` +
        `(expected PNG, JPEG, or WebP)`,
    );
  }
  if (
    typeof result.width !== "number" ||
    typeof result.height !== "number" ||
    result.width <= 0 ||
    result.height <= 0
  ) {
    throw new ValidationError("screenshot image data is corrupt or has no dimensions");
  }

  return { format, width: result.width, height: result.height, byteLength: buf.byteLength };
}

/** Enforce the size/dimension/pixel limits on already-measured image facts. */
export function enforceImageLimits(meta: ImageMeta, limits: ImageLimits): void {
  if (meta.byteLength > limits.maxBytes) {
    throw new ValidationError(
      `screenshot is ${meta.byteLength} bytes, exceeding the ` +
        `${limits.maxBytes}-byte (${Math.round(limits.maxBytes / (1024 * 1024))} MB) limit`,
    );
  }
  if (meta.width > limits.maxEdge || meta.height > limits.maxEdge) {
    throw new ValidationError(
      `screenshot is ${meta.width}x${meta.height}px, exceeding the ` +
        `${limits.maxEdge}px per-side limit`,
    );
  }
  if (meta.width * meta.height > limits.maxPixels) {
    throw new ValidationError(
      `screenshot has ${meta.width * meta.height} pixels, exceeding the ` +
        `${limits.maxPixels}-pixel limit`,
    );
  }
}

/**
 * Download `url` into memory under a hard byte cap (the body stream is aborted
 * the moment it would exceed maxBytes) and a timeout, then sniff + measure +
 * enforce the limits. Returns the validated bytes so a caller can persist the
 * exact bytes that passed validation. Throws ValidationError on any failure,
 * with a publisher-friendly message naming the URL.
 */
export async function fetchAndValidateImage(
  url: string,
  limits: Partial<ImageLimits> = {},
): Promise<{ meta: ImageMeta; bytes: Buffer }> {
  const lim: ImageLimits = { ...DEFAULT_IMAGE_LIMITS, ...limits };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), lim.timeoutMs);
  try {
    let res: Response;
    try {
      res = await fetch(url, { signal: controller.signal, redirect: "follow" });
    } catch (err) {
      if (controller.signal.aborted) {
        throw new ValidationError(
          `screenshot download timed out after ${lim.timeoutMs}ms: "${url}"`,
        );
      }
      throw new ValidationError(`screenshot is unreachable: "${url}" (${errMessage(err)})`);
    }

    if (!res.ok) {
      throw new ValidationError(`screenshot URL returned HTTP ${res.status}: "${url}"`);
    }
    if (!res.body) {
      throw new ValidationError(`screenshot response had no body: "${url}"`);
    }

    const bytes = await readCapped(res.body, lim.maxBytes, url, controller);

    let meta: ImageMeta;
    try {
      meta = sniffAndMeasure(bytes);
    } catch (err) {
      // Re-throw with the URL attached for a publisher-friendly message.
      throw new ValidationError(`${errMessage(err)}: "${url}"`);
    }
    enforceImageLimits(meta, lim);
    return { meta, bytes };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Validate an already-committed screenshot file on disk: sniff its format,
 * measure it, and enforce the size/dimension limits — the same checks as
 * fetchAndValidateImage but reading local bytes rather than the network. Used
 * for releases that ship their screenshots in the repo (the served copy), so
 * validation never depends on a reachable external URL. Throws ValidationError
 * naming the path on any failure.
 */
export async function validateImageFile(
  path: string,
  limits: Partial<ImageLimits> = {},
): Promise<ImageMeta> {
  const lim: ImageLimits = { ...DEFAULT_IMAGE_LIMITS, ...limits };
  const bytes = await readFile(path);
  let meta: ImageMeta;
  try {
    meta = sniffAndMeasure(bytes);
  } catch (err) {
    throw new ValidationError(`${errMessage(err)}: "${path}"`);
  }
  enforceImageLimits(meta, lim);
  return meta;
}

/** Pull a stream into a Buffer, aborting as soon as it would exceed maxBytes. */
async function readCapped(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
  url: string,
  controller: AbortController,
): Promise<Buffer> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        controller.abort();
        throw new ValidationError(
          `screenshot exceeds the ${Math.round(maxBytes / (1024 * 1024))} MB size limit: "${url}"`,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
