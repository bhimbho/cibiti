import { canAnywhere, requireActor } from "@/server/authz";
import { badRequest, forbidden, route } from "@/server/http";
import { storeAsset } from "@/server/assets";

// Upload an image (question media, candidate photos). Bytes stream to object storage via the app.
export const POST = route(async (request: Request) => {
  const actor = await requireActor();
  if (!canAnywhere(actor, "question:write") && !canAnywhere(actor, "people:manage")) throw forbidden();

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw badRequest("Attach an image in the \"file\" field.");
  const altText = form?.get("altText");

  const asset = await storeAsset(actor, file, typeof altText === "string" ? altText : undefined);
  return Response.json({ asset }, { status: 201 });
});
