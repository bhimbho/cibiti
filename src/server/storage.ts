import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

// S3-compatible object storage (Garage on LAN servers). Bytes are always streamed through the
// app so browsers only ever talk to one origin and every read is permission-checked.

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

let client: S3Client | undefined;

function s3(): S3Client {
  client ??= new S3Client({
    endpoint: required("STORAGE_ENDPOINT"),
    region: process.env.STORAGE_REGION ?? "garage",
    forcePathStyle: true,
    credentials: {
      accessKeyId: required("STORAGE_ACCESS_KEY"),
      secretAccessKey: required("STORAGE_SECRET_KEY"),
    },
  });
  return client;
}

const bucket = () => required("STORAGE_BUCKET");

export async function putObject(key: string, body: Uint8Array, contentType: string): Promise<void> {
  await s3().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }));
}

export async function getObject(key: string): Promise<{ body: ReadableStream; contentType?: string; contentLength?: number }> {
  const result = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  if (!result.Body) throw new Error(`Object ${key} has no body.`);
  return { body: result.Body.transformToWebStream(), contentType: result.ContentType, contentLength: result.ContentLength };
}

export async function deleteObject(key: string): Promise<void> {
  await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

export async function checkStorage(): Promise<void> {
  await s3().send(new HeadBucketCommand({ Bucket: bucket() }));
}
