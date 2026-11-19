import { libraryRoute, reply } from "@/lib/server/library-http";
import { LibraryError } from "@/lib/server/library-store";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function datasetId(ctx: RouteContext<"/api/library/[id]">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) throw new LibraryError("not_found", "That dataset isn’t in your library.", 404);
  return id;
}

/** A short-lived link to download one of the viewer's saved files. */
export async function GET(request: Request, ctx: RouteContext<"/api/library/[id]">) {
  return libraryRoute(request, async ({ owner, store }) => {
    const hit = await store.find(owner, await datasetId(ctx));
    if (!hit) throw new LibraryError("not_found", "That dataset isn’t in your library.", 404);
    return reply({ item: hit.row, url: await store.downloadUrl(hit.objectPath) });
  });
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/library/[id]">) {
  return libraryRoute(
    request,
    async ({ owner, store }) => {
      if (!(await store.remove(owner, await datasetId(ctx))))
        throw new LibraryError("not_found", "That dataset isn’t in your library.", 404);
      return reply({ ok: true });
    },
    { write: true },
  );
}
