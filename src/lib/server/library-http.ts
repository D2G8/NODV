import { requireIdentity } from "../../../cursor/identity";
import type { LibraryErrorCode } from "../library-shared";
import { getStore, LibraryError, ownerKey, type LibraryStore } from "./library-store";

const NO_STORE = { "cache-control": "private, no-store" };

export function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: NO_STORE });
}

function problem(code: LibraryErrorCode, message: string, status: number) {
  return reply({ error: code, message }, status);
}

export interface LibraryContext {
  owner: string;
  store: LibraryStore;
}

/**
 * Runs a library route for the signed-in viewer. Writes must come from this app's own pages:
 * browsers mark cross-site requests in Sec-Fetch-Site, and JSON bodies can't be sent
 * cross-site without a CORS preflight, which this app never answers.
 */
export async function libraryRoute(
  request: Request,
  handler: (ctx: LibraryContext) => Promise<Response>,
  { write = false, json = false } = {},
): Promise<Response> {
  if (write && request.headers.get("sec-fetch-site") === "cross-site")
    return problem("bad_request", "Cross-site requests aren’t allowed.", 403);
  if (json && !request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    return problem("bad_request", "Expected a JSON body.", 415);

  const identity = await requireIdentity(request);
  if (identity instanceof Response)
    return problem("sign_in", "Sign in to Cursor to use the library. It works when the app is published as private or team.", 401);

  const store = getStore();
  if (!store)
    return problem("not_connected", "The library isn’t connected yet: the app’s Supabase secret key hasn’t been added.", 503);

  try {
    return await handler({ owner: ownerKey(identity), store });
  } catch (err) {
    if (err instanceof LibraryError) return problem(err.code, err.message, err.status);
    console.error("Library route failed", err instanceof Error ? err.message : err);
    return problem("failed", "The library request failed.", 500);
  }
}

export async function readJson(request: Request, maxBytes: number): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.length > maxBytes) throw new LibraryError("bad_request", "Request is too large.", 413);
  try {
    const body = JSON.parse(text);
    if (body && typeof body === "object" && !Array.isArray(body)) return body;
  } catch {}
  throw new LibraryError("bad_request", "Expected a JSON object.");
}
