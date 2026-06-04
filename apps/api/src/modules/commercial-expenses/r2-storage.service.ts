import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";

type UploadExpenseSupportInput = {
  fileName: string;
  contentType: string;
  body: Buffer | Uint8Array | Readable;
};

type UploadedExpenseSupport = {
  bucket: string;
  objectKey: string;
};

@Injectable()
export class R2StorageService {
  private readonly bucket: string;
  private readonly client: S3Client;

  constructor(configService: ConfigService) {
    const accountId = this.requireEnv(configService, "R2_ACCOUNT_ID");
    const accessKeyId = this.requireEnv(configService, "R2_ACCESS_KEY_ID");
    const secretAccessKey = this.requireEnv(
      configService,
      "R2_SECRET_ACCESS_KEY",
    );
    this.bucket = this.requireEnv(configService, "R2_BUCKET");

    const endpoint =
      configService.get<string>("R2_ENDPOINT") ??
      `https://${accountId}.r2.cloudflarestorage.com`;

    this.client = new S3Client({
      region: "auto",
      endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  async uploadExpenseSupport({
    fileName,
    contentType,
    body,
  }: UploadExpenseSupportInput): Promise<UploadedExpenseSupport> {
    const datePrefix = new Date().toISOString().slice(0, 10);
    const objectKey = [
      "commercial-expenses",
      datePrefix,
      `${randomUUID()}-${this.safeFileName(fileName)}`,
    ].join("/");

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Body: body,
        ContentType: contentType,
      }),
    );

    return {
      bucket: this.bucket,
      objectKey,
    };
  }

  async deleteObject(objectKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
      }),
    );
  }

  async getObjectStream(objectKey: string): Promise<Readable> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
      }),
    );

    return response.Body as Readable;
  }

  createSignedReadUrl(objectKey: string): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
      }),
      { expiresIn: 60 },
    );
  }

  private requireEnv(configService: ConfigService, name: string): string {
    const value = configService.get<string>(name);

    if (!value) {
      throw new InternalServerErrorException(`${name} is required`);
    }

    return value;
  }

  private safeFileName(fileName: string): string {
    return fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
  }
}
