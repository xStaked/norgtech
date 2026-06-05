import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  Injectable,
  InternalServerErrorException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";

export interface StoredFile {
  bucket: string;
  objectKey: string;
}

export interface UploadFileInput {
  prefix: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  body: Buffer | Uint8Array | Readable;
}

type R2ClientConfig = {
  bucket: string;
  clientConfig: S3ClientConfig;
};

@Injectable()
export class R2StorageService {
  private bucket?: string;
  private client?: S3Client;

  constructor(private readonly configService: ConfigService) {}

  async uploadFile(input: UploadFileInput): Promise<StoredFile> {
    const { client, bucket } = this.getClient();
    const datePrefix = new Date().toISOString().slice(0, 10);
    const objectKey =
      `${input.prefix}${datePrefix}/` +
      `${randomUUID()}-${this.safeFileName(input.fileName)}`;

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: input.body,
        ContentType: input.contentType,
        ContentLength: input.sizeBytes,
      }),
    );

    return { bucket, objectKey };
  }

  async deleteObject(objectKey: string): Promise<void> {
    const { client, bucket } = this.getClient();
    await client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }),
    );
  }

  async getObjectStream(objectKey: string): Promise<Readable> {
    const { client, bucket } = this.getClient();
    const response = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: objectKey }),
    );
    if (!response.Body) {
      throw new InternalServerErrorException("R2 object response body missing");
    }
    return response.Body as Readable;
  }

  createSignedReadUrl(objectKey: string): Promise<string> {
    const { client, bucket } = this.getClient();
    return getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: bucket, Key: objectKey }),
      { expiresIn: 60 },
    );
  }

  private getClient(): { client: S3Client; bucket: string } {
    if (!this.client || !this.bucket) {
      const { bucket, clientConfig } = this.getClientConfig();
      this.client = new S3Client(clientConfig);
      this.bucket = bucket;
    }
    return { client: this.client, bucket: this.bucket };
  }

  private getClientConfig(): R2ClientConfig {
    const accountId = this.requireEnv("R2_ACCOUNT_ID");
    const accessKeyId = this.requireEnv("R2_ACCESS_KEY_ID");
    const secretAccessKey = this.requireEnv("R2_SECRET_ACCESS_KEY");
    const bucket = this.requireEnv("R2_BUCKET");
    const endpoint =
      this.configService.get<string>("R2_ENDPOINT") ??
      `https://${accountId}.r2.cloudflarestorage.com`;
    return {
      bucket,
      clientConfig: {
        region: "auto",
        endpoint,
        credentials: { accessKeyId, secretAccessKey },
      },
    };
  }

  private requireEnv(name: string): string {
    const value = this.configService.get<string>(name);
    if (!value) {
      throw new InternalServerErrorException(`${name} is required`);
    }
    return value;
  }

  private safeFileName(fileName: string): string {
    return fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
  }
}
