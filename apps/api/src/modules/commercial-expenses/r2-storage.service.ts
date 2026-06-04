import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import {
  EXPENSE_SUPPORT_ALLOWED_MIME_TYPES,
  EXPENSE_SUPPORT_MAX_BYTES,
} from "./commercial-expense-constants";

const EXPENSE_SUPPORT_OBJECT_PREFIX = "commercial-expenses/";

export interface UploadExpenseSupportInput {
  fileName: string;
  contentType: string;
  sizeBytes: number;
  body: Buffer | Uint8Array | Readable;
}

export interface UploadedExpenseSupport {
  bucket: string;
  objectKey: string;
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

  async uploadExpenseSupport(
    input: UploadExpenseSupportInput,
  ): Promise<UploadedExpenseSupport> {
    if (
      !EXPENSE_SUPPORT_ALLOWED_MIME_TYPES.includes(
        input.contentType as (typeof EXPENSE_SUPPORT_ALLOWED_MIME_TYPES)[number],
      )
    ) {
      throw new BadRequestException("Unsupported expense support content type");
    }

    if (input.sizeBytes > EXPENSE_SUPPORT_MAX_BYTES) {
      throw new BadRequestException("Expense support exceeds maximum size");
    }

    const { client, bucket } = this.getClient();
    const datePrefix = new Date().toISOString().slice(0, 10);
    const objectKey =
      `${EXPENSE_SUPPORT_OBJECT_PREFIX}${datePrefix}/` +
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

    return {
      bucket,
      objectKey,
    };
  }

  async deleteObject(objectKey: string): Promise<void> {
    this.assertExpenseObjectKey(objectKey);
    const { client, bucket } = this.getClient();

    await client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: objectKey,
      }),
    );
  }

  async getObjectStream(objectKey: string): Promise<Readable> {
    this.assertExpenseObjectKey(objectKey);
    const { client, bucket } = this.getClient();

    const response = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: objectKey,
      }),
    );

    if (!response.Body) {
      throw new InternalServerErrorException("R2 object response body missing");
    }

    return response.Body as Readable;
  }

  createSignedReadUrl(objectKey: string): Promise<string> {
    this.assertExpenseObjectKey(objectKey);
    const { client, bucket } = this.getClient();

    return getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: bucket,
        Key: objectKey,
      }),
      { expiresIn: 60 },
    );
  }

  private getClient(): { client: S3Client; bucket: string } {
    if (!this.client || !this.bucket) {
      const { bucket, clientConfig } = this.getClientConfig();

      this.client = new S3Client(clientConfig);
      this.bucket = bucket;
    }

    return {
      client: this.client,
      bucket: this.bucket,
    };
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
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
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

  private assertExpenseObjectKey(objectKey: string): void {
    if (!objectKey.startsWith(EXPENSE_SUPPORT_OBJECT_PREFIX)) {
      throw new BadRequestException("Invalid expense support object key");
    }
  }

  private safeFileName(fileName: string): string {
    return fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
  }
}
