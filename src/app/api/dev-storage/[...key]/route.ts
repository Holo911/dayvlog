import { open, stat } from "node:fs/promises";
import { MAX_CLIP_BYTES } from "@/lib/clips";
import { localPath, readLocalType, storage, writeLocal } from "@/lib/storage";

// Stand-in for R2 during local development only. Supports Range requests because
// Safari refuses to play video from servers that don't.

function enabled() {
  return !storage.remote && process.env.NODE_ENV !== "production";
}

const keyOf = async (ctx: RouteContext<"/api/dev-storage/[...key]">) => (await ctx.params).key.join("/");

export async function PUT(req: Request, ctx: RouteContext<"/api/dev-storage/[...key]">) {
  if (!enabled()) return new Response("Not found", { status: 404 });
  const body = Buffer.from(await req.arrayBuffer());
  if (body.length > MAX_CLIP_BYTES) return new Response("Too large", { status: 413 });
  await writeLocal(await keyOf(ctx), body, req.headers.get("content-type") ?? "application/octet-stream");
  return new Response(null, { status: 200 });
}

export async function GET(req: Request, ctx: RouteContext<"/api/dev-storage/[...key]">) {
  if (!enabled()) return new Response("Not found", { status: 404 });
  const key = await keyOf(ctx);
  let file: string;
  let size: number;
  try {
    file = localPath(key);
    size = (await stat(file)).size;
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const type = await readLocalType(key);
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.get("range") ?? "");
  let start = 0;
  let end = size - 1;
  if (range) {
    if (range[1]) start = Number(range[1]);
    if (range[2]) end = Math.min(Number(range[2]), size - 1);
    if (!range[1] && range[2]) start = Math.max(0, size - Number(range[2]));
    if (start > end || start >= size) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
  }
  const handle = await open(file, "r");
  const buf = Buffer.alloc(end - start + 1);
  await handle.read(buf, 0, buf.length, start);
  await handle.close();
  return new Response(buf, {
    status: range ? 206 : 200,
    headers: {
      "Content-Type": type,
      "Content-Length": String(buf.length),
      "Accept-Ranges": "bytes",
      ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
