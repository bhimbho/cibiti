import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { Actor } from "./authz";
import { badRequest, HttpError, notFound } from "./http";
import { getObject, putObject } from "./storage";
import { MAX_UPLOAD_BYTES, sniffMime } from "./uploads";

export type StoredAsset = { id: string; mimeType: string; byteSize: number; url: string };

const present = (asset: { id: string; mimeType: string; byteSize: number }): StoredAsset => ({
  id: asset.id,
  mimeType: asset.mimeType,
  byteSize: asset.byteSize,
  url: `/api/assets/${asset.id}`,
});

/** Store an uploaded image once per organisation, keyed by its content hash. */
export async function storeAsset(actor: Actor, file: File, altText?: string): Promise<StoredAsset> {
  if (file.size === 0) throw badRequest("The file is empty.");
  if (file.size > MAX_UPLOAD_BYTES) throw new HttpError(413, `Images must be ${MAX_UPLOAD_BYTES / 1024 / 1024} MB or smaller.`);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = sniffMime(bytes);
  if (!mimeType) throw badRequest("Only PNG, JPEG, GIF or WebP images can be uploaded.");

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const existing = await prisma.asset.findUnique({ where: { orgId_sha256: { orgId: actor.orgId, sha256 } } });
  if (existing) return present(existing);

  const storageKey = `org/${actor.orgId}/assets/${sha256}`;
  await putObject(storageKey, bytes, mimeType);

  try {
    const asset = await prisma.asset.create({
      data: {
        orgId: actor.orgId,
        sha256,
        mimeType,
        byteSize: bytes.byteLength,
        storageKey,
        originalName: file.name.slice(0, 255) || "upload",
        altText: altText?.slice(0, 500),
        createdById: actor.userId,
      },
    });
    return present(asset);
  } catch (error) {
    // The same image uploaded twice at once: both wrote identical bytes; return the winner.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return present(await prisma.asset.findUniqueOrThrow({ where: { orgId_sha256: { orgId: actor.orgId, sha256 } } }));
    }
    throw error;
  }
}

export async function readAsset(actor: Actor, id: string) {
  const asset = await prisma.asset.findFirst({ where: { id, orgId: actor.orgId } });
  if (!asset) throw notFound("Image");
  const object = await getObject(asset.storageKey);
  return { asset, body: object.body };
}
