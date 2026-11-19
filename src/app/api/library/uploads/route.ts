import { CONTENT_TYPES, MAX_DATASETS_PER_VIEWER, MAX_LIBRARY_BYTES } from "@/lib/library-shared";
import { libraryRoute, readJson, reply } from "@/lib/server/library-http";
import { LibraryError, newObjectPath } from "@/lib/server/library-store";

/** Hands out a one-off upload URL for a file the viewer is about to save. */
export async function POST(request: Request) {
  return libraryRoute(
    request,
    async ({ owner, store }) => {
      const body = await readJson(request, 4_000);
      const fileName = typeof body.fileName === "string" ? body.fileName.trim() : "";
      const size = Number(body.size);
      const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
      if (!fileName || fileName.length > 255) throw new LibraryError("bad_request", "The file needs a name of up to 255 characters.");
      if (!CONTENT_TYPES[ext]) throw new LibraryError("bad_request", "Only ODV, CSV/TSV and Excel files can be saved.");
      if (!Number.isFinite(size) || size <= 0 || size > MAX_LIBRARY_BYTES)
        throw new LibraryError("bad_request", "Files larger than 25 MB can’t be saved to the library.");
      if ((await store.count(owner)) >= MAX_DATASETS_PER_VIEWER || (await store.uploadCount(owner)) >= MAX_DATASETS_PER_VIEWER + 20)
        throw new LibraryError("limit", `Your library is full (${MAX_DATASETS_PER_VIEWER} datasets). Remove some to save more.`, 409);

      const path = newObjectPath(owner, fileName);
      const upload = await store.createUpload(path, CONTENT_TYPES[ext]);
      return reply({ path, ...upload });
    },
    { write: true, json: true },
  );
}
