import { requireActor } from "@/server/authz";
import { route } from "@/server/http";
import { readAsset } from "@/server/assets";

// Serve an image to signed-in members of the same organisation.
export const GET = route(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor();
  const { id } = await params;
  const { asset, body } = await readAsset(actor, id);

  return new Response(body, {
    headers: {
      "Content-Type": asset.mimeType,
      "Content-Length": String(asset.byteSize),
      // Content-addressed and immutable, but private to signed-in users.
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
