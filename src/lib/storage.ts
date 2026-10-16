import "server-only";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

// Clips live in object storage, never in Postgres. Production uses Cloudflare R2 through
// its S3 API (phones upload straight to R2 with a presigned URL, so video never passes
// through a Vercel function). Without R2 credentials, dev falls back to files in .data/storage.

export type UploadTarget = { url: string; headers: Record<string, string> };

interface Storage {
  remote: boolean;
  uploadTarget(key: string, contentType: string): Promise<UploadTarget>;
  viewUrl(key: string): Promise<string>;
  head(key: string): Promise<{ size: number } | null>;
  remove(keys: string[]): Promise<void>;
}

const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;

function r2Storage(): Storage {
  const bucket = R2_BUCKET!;
  const sdk = import("@aws-sdk/client-s3");
  const presigner = import("@aws-sdk/s3-request-presigner");
  const client = sdk.then(
    ({ S3Client }) =>
      new S3Client({
        region: "auto",
        endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId: R2_ACCESS_KEY_ID!, secretAccessKey: R2_SECRET_ACCESS_KEY! },
        // R2 rejects the SDK's default CRC32 checksum params on presigned uploads.
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
      }),
  );

  return {
    remote: true,
    async uploadTarget(key, contentType) {
      const { PutObjectCommand } = await sdk;
      const { getSignedUrl } = await presigner;
      const cmd = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
      const url = await getSignedUrl(await client, cmd, { expiresIn: 600 });
      return { url, headers: { "Content-Type": contentType } };
    },
    async viewUrl(key) {
      const { GetObjectCommand } = await sdk;
      const { getSignedUrl } = await presigner;
      // Signing with the start of the hour keeps the URL identical for an hour, so the
      // browser can reuse what it already downloaded instead of fetching the clip again.
      const signingDate = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000);
      const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
      return getSignedUrl(await client, cmd, { expiresIn: 4 * 3600, signingDate });
    },
    async head(key) {
      const { HeadObjectCommand } = await sdk;
      try {
        const res = await (await client).send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return { size: res.ContentLength ?? 0 };
      } catch {
        return null;
      }
    },
    async remove(keys) {
      const { DeleteObjectsCommand } = await sdk;
      for (let i = 0; i < keys.length; i += 1000) {
        const batch = keys.slice(i, i + 1000).map((Key) => ({ Key }));
        await (await client).send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: batch, Quiet: true } }));
      }
    },
  };
}

export const LOCAL_STORAGE_DIR = path.join(process.cwd(), ".data", "storage");

export function localPath(key: string) {
  const file = path.resolve(LOCAL_STORAGE_DIR, key);
  if (!file.startsWith(LOCAL_STORAGE_DIR + path.sep)) throw new Error("Bad storage key");
  return file;
}

function localStorage(): Storage {
  return {
    remote: false,
    async uploadTarget(key, contentType) {
      return { url: `/api/dev-storage/${key}`, headers: { "Content-Type": contentType } };
    },
    async viewUrl(key) {
      return `/api/dev-storage/${key}`;
    },
    async head(key) {
      try {
        return { size: (await stat(localPath(key))).size };
      } catch {
        return null;
      }
    },
    async remove(keys) {
      await Promise.all(keys.map((k) => rm(localPath(k), { force: true })));
      await Promise.all(keys.map((k) => rm(localPath(k) + ".type", { force: true })));
    },
  };
}

export async function writeLocal(key: string, body: Buffer, contentType: string) {
  const file = localPath(key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
  await writeFile(file + ".type", contentType);
}

export async function readLocalType(key: string) {
  try {
    return (await readFile(localPath(key) + ".type", "utf8")).trim();
  } catch {
    return "application/octet-stream";
  }
}

export const storage: Storage =
  R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET ? r2Storage() : localStorage();
