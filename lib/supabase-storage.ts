/**
 * Supabase Storage REST helper for private Talk-to-Mike audio.
 * Uses env secret store (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).
 * Never returns the service key to callers.
 */

import {
  MIKE_INTAKE_BUCKET,
  MIKE_INTAKE_UPLOAD_TTL_MS,
} from "./mike-intake-policy";
import type { MikeIntakeStorage, SignedUploadInfo } from "./mike-intake-types";

function supabaseUrl(): string {
  return (
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    ""
  ).replace(/\/+$/, "");
}

function serviceKey(): string {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_KEY?.trim() ||
    ""
  );
}

export function isMikeIntakeStorageConfigured(): boolean {
  return Boolean(supabaseUrl() && serviceKey());
}

export class SupabaseMikeIntakeStorage implements MikeIntakeStorage {
  async createSignedUpload(input: {
    path: string;
    contentType: string;
    upsert?: boolean;
  }): Promise<SignedUploadInfo> {
    const base = supabaseUrl();
    const key = serviceKey();
    if (!base || !key) throw new Error("supabase_storage_unconfigured");
    const expiresIn = Math.floor(MIKE_INTAKE_UPLOAD_TTL_MS / 1000);
    const res = await fetch(
      `${base}/storage/v1/object/upload/sign/${MIKE_INTAKE_BUCKET}/${input.path}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          apikey: key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ expiresIn }),
      },
    );
    if (!res.ok) {
      throw new Error(`supabase_sign_failed:${res.status}`);
    }
    const body = (await res.json()) as { token?: string; signedUrl?: string; url?: string };
    const token = body.token || "";
    const signedPath = body.url || body.signedUrl || "";
    const url = signedPath.startsWith("http")
      ? signedPath
      : `${base}/storage/v1${signedPath.startsWith("/") ? "" : "/object/upload/sign/"}${signedPath}${
          token && !signedPath.includes("token=")
            ? `${signedPath.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`
            : ""
        }`;
    return {
      url,
      method: "PUT",
      headers: {
        "Content-Type": input.contentType,
        "x-upsert": input.upsert ? "true" : "false",
      },
      expiresAt: new Date(Date.now() + MIKE_INTAKE_UPLOAD_TTL_MS).toISOString(),
      bucket: MIKE_INTAKE_BUCKET,
      path: input.path,
    };
  }

  async headObject(path: string) {
    const base = supabaseUrl();
    const key = serviceKey();
    if (!base || !key) return { exists: false };
    const res = await fetch(
      `${base}/storage/v1/object/info/${MIKE_INTAKE_BUCKET}/${path}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${key}`, apikey: key },
      },
    );
    if (res.status === 404) return { exists: false };
    if (!res.ok) {
      const probe = await fetch(`${base}/storage/v1/object/${MIKE_INTAKE_BUCKET}/${path}`, {
        method: "HEAD",
        headers: { Authorization: `Bearer ${key}`, apikey: key },
      });
      if (!probe.ok) return { exists: false };
      const len = probe.headers.get("content-length");
      return {
        exists: true,
        bytes: len ? Number(len) : undefined,
        contentType: probe.headers.get("content-type") || undefined,
      };
    }
    const info = (await res.json()) as {
      size?: number;
      metadata?: { size?: number; mimetype?: string };
      contentType?: string;
    };
    return {
      exists: true,
      bytes: info.size ?? info.metadata?.size,
      contentType: info.contentType ?? info.metadata?.mimetype,
    };
  }

  async deleteObject(path: string) {
    const base = supabaseUrl();
    const key = serviceKey();
    if (!base || !key) return;
    await fetch(`${base}/storage/v1/object/${MIKE_INTAKE_BUCKET}/${path}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${key}`, apikey: key },
    });
  }
}
