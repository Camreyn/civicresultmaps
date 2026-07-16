import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { requireLayoutAdmin } from "@/lib/ui-layout-auth";
import { createLayoutAsset } from "@/lib/ui-layout-v3-repository";

export const runtime = "nodejs";

const allowedContentTypes = ["image/avif", "image/jpeg", "image/png", "image/webp"] as const;
const maxImageBytes = 5 * 1024 * 1024;

type UploadMetadata = {
  assetId: string;
  actorEmail: string;
  actorId: string;
  alt: string;
  contentType: (typeof allowedContentTypes)[number];
  height: number;
  sizeBytes: number;
  width: number;
};

export async function POST(request: Request) {
  try {
    const body = await request.json() as HandleUploadBody;
    const actor = body.type === "blob.generate-client-token"
      ? await requireLayoutAdmin()
      : null;
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!actor) throw new Error("Sign in is required.");
        if (!pathname.startsWith("layout-media/")) {
          throw new Error("Uploads must use the layout-media namespace.");
        }
        const metadata = parseClientMetadata(clientPayload);
        return {
          addRandomSuffix: true,
          allowedContentTypes: [...allowedContentTypes],
          maximumSizeInBytes: maxImageBytes,
          tokenPayload: JSON.stringify({ ...metadata, actorEmail: actor.email, actorId: actor.id }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const metadata = parseTokenMetadata(tokenPayload);
        if (!allowedContentTypes.includes(blob.contentType as UploadMetadata["contentType"])) {
          throw new Error("The uploaded file type is not allowed.");
        }
        await createLayoutAsset({
          actor: { email: metadata.actorEmail, id: metadata.actorId },
          alt: metadata.alt,
          contentType: blob.contentType as UploadMetadata["contentType"],
          id: metadata.assetId,
          height: metadata.height,
          pathname: blob.pathname,
          sizeBytes: metadata.sizeBytes,
          url: blob.url,
          width: metadata.width,
        });
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Image upload failed.";
    const status = /authorized|sign in|required/i.test(message) ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

function parseClientMetadata(value: string | null) {
  if (!value) throw new Error("Image metadata is required.");
  const parsed = JSON.parse(value) as Partial<UploadMetadata>;
  const assetId = String(parsed.assetId ?? "");
  const contentType = String(parsed.contentType ?? "") as UploadMetadata["contentType"];
  const sizeBytes = Number(parsed.sizeBytes);
  const width = Number(parsed.width);
  const height = Number(parsed.height);
  if (!allowedContentTypes.includes(contentType)) throw new Error("Only PNG, JPEG, WebP, and AVIF images are allowed.");
  if (!Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > maxImageBytes) throw new Error("Images must be 5 MB or smaller.");
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new Error("Image dimensions are required.");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(assetId)) throw new Error("Image asset ID is invalid.");
  return { assetId, alt: String(parsed.alt ?? "").trim().slice(0, 300), contentType, height, sizeBytes, width };
}

function parseTokenMetadata(value: string | null | undefined): UploadMetadata {
  if (!value) throw new Error("Signed image metadata is missing.");
  const parsed = JSON.parse(value) as Partial<UploadMetadata>;
  const safe = parseClientMetadata(JSON.stringify(parsed));
  if (!parsed.actorId || !parsed.actorEmail) throw new Error("Signed uploader identity is missing.");
  return { ...safe, actorEmail: parsed.actorEmail, actorId: parsed.actorId };
}
