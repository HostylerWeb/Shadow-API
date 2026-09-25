import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { signDocumentUrl } from "@shadowapi/graph-runner";

const FIFTEEN_MINUTES = 15 * 60;

export async function signedDocumentUrl(blobId: string): Promise<string> {
  const endpoint = process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET;
  if (!endpoint || !bucket) return signDocumentUrl(blobId);
  const client = new S3Client({
    region: process.env.S3_REGION ?? "us-east-1",
    endpoint,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
    },
  });
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: blobId }), { expiresIn: FIFTEEN_MINUTES });
}
