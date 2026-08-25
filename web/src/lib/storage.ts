/**
 * Object storage, spoken to over the S3 API.
 *
 * Supabase Storage, Cloudflare R2 and S3 itself all answer this protocol, so
 * moving between them is a change of environment variables rather than of
 * code.
 *
 * Files never travel through the application: browsers upload straight to
 * storage with a presigned PUT, and read back with a presigned GET. Proxying
 * a 200 MB STEP file through a serverless function would hit the body limit
 * long before it hit anything else.
 */

import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { env } from './env';

let client: S3Client | null = null;

function s3() {
  if (client) return client;

  const config = env();
  client = new S3Client({
    endpoint: config.STORAGE_ENDPOINT,
    region: config.STORAGE_REGION,
    // Required by R2 and Supabase: they address buckets by path, not by
    // subdomain.
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.STORAGE_ACCESS_KEY_ID,
      secretAccessKey: config.STORAGE_SECRET_ACCESS_KEY,
    },
  });
  return client;
}

/**
 * Where a version's files live.
 *
 * The version id is in the path, so a new revision never overwrites an old
 * one -- past revisions stay openable, which is the point of keeping them.
 */
export const storageKeys = {
  source: (projectId: string, modelId: string, versionId: string, extension: string) =>
    `${projectId}/${modelId}/${versionId}/source${extension}`,
  glb: (projectId: string, modelId: string, versionId: string) =>
    `${projectId}/${modelId}/${versionId}/model.glb`,
  metadata: (projectId: string, modelId: string, versionId: string) =>
    `${projectId}/${modelId}/${versionId}/metadata.json`,
  thumbnail: (projectId: string, modelId: string, versionId: string) =>
    `${projectId}/${modelId}/${versionId}/thumb.png`,
};

export async function presignUpload(key: string, contentType: string) {
  const config = env();
  return getSignedUrl(
    s3(),
    new PutObjectCommand({
      Bucket: config.STORAGE_BUCKET,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: config.STORAGE_URL_TTL_SECONDS },
  );
}

export async function presignDownload(key: string) {
  const config = env();
  return getSignedUrl(
    s3(),
    new GetObjectCommand({ Bucket: config.STORAGE_BUCKET, Key: key }),
    { expiresIn: config.STORAGE_URL_TTL_SECONDS },
  );
}
