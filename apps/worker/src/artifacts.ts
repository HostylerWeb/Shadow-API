import { CreateBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

let bucketReady = false;

function client(): S3Client {
  return new S3Client({
    region: process.env.S3_REGION ?? "us-east-1",
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
    },
  });
}

export async function storePod(tenantId: string, jobId: string, body: Uint8Array): Promise<string> {
  const bucket = process.env.S3_BUCKET ?? "shadowapi-artifacts";
  const key = `pods/${tenantId}/${jobId}.bin`;
  const s3 = client();
  if (!bucketReady) {
    try {
      await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    } catch {
      // Bucket already exists.
    }
    bucketReady = true;
  }
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: "application/octet-stream" }));
  return key;
}
