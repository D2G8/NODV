import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { MAX_LIBRARY_BYTES } from "@/lib/library-shared";
import { libraryRoute, reply } from "@/lib/server/library-http";
import { isLocalStore, isObjectPath, LibraryError, localFilePath, localFilesRoot } from "@/lib/server/library-store";

/** Upload and download for the development-only local library; disabled once Supabase or the host is configured. */
async function objectPath(ctx: RouteContext<"/api/library/local-file/[...key]">, owner: string) {
  if (!isLocalStore()) throw new LibraryError("not_found", "Not found.", 404);
  const { key } = await ctx.params;
  const joined = key.join("/");
  if (!isObjectPath(joined, owner)) throw new LibraryError("not_found", "Not found.", 404);
  return localFilePath(localFilesRoot(), joined);
}

export async function GET(request: Request, ctx: RouteContext<"/api/library/local-file/[...key]">) {
  return libraryRoute(request, async ({ owner }) => {
    const file = await readFile(await objectPath(ctx, owner)).catch(() => null);
    if (!file) throw new LibraryError("not_found", "Not found.", 404);
    return new Response(new Uint8Array(file), {
      headers: { "content-type": "application/octet-stream", "cache-control": "private, no-store", "x-content-type-options": "nosniff" },
    });
  });
}

export async function PUT(request: Request, ctx: RouteContext<"/api/library/local-file/[...key]">) {
  return libraryRoute(
    request,
    async ({ owner }) => {
      const target = await objectPath(ctx, owner);
      if (Number(request.headers.get("content-length") ?? 0) > MAX_LIBRARY_BYTES)
        throw new LibraryError("bad_request", "Files larger than 25 MB can’t be saved.");
      const body = new Uint8Array(await request.arrayBuffer());
      if (!body.length || body.length > MAX_LIBRARY_BYTES) throw new LibraryError("bad_request", "Files larger than 25 MB can’t be saved.");
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, body, { flag: "wx" }).catch(() => {
        throw new LibraryError("bad_request", "That upload was already used.");
      });
      return reply({ ok: true });
    },
    { write: true },
  );
}
