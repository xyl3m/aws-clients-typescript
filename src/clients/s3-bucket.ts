import {
    _Object,
    DeleteObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
    HeadObjectOutput,
    ListObjectsV2Command,
    PutObjectCommand,
    S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import logger from '../utils/logger';
import { S3BucketException } from '../exceptions/s3-bucket-exception';
import { Readable } from 'stream';

/**
 * S3Bucket class for managing AWS SQS operations.
 */
export class S3Bucket {
    private readonly s3Client: S3Client;
    private readonly bucketName: string;

    /**
     * Constructor for the S3Bucket class.
     *
     * @param region The AWS region for the S3 bucket.
     * @param bucketName The name of the S3 bucket.
     */
    constructor(region: string, bucketName: string) {
        this.s3Client = new S3Client({ region });
        this.bucketName = bucketName;
    }

    /**
     * Lists objects in the S3 bucket with an optional prefix and maximum number of keys.
     *
     * @param prefix The prefix to filter objects. Default is an empty string.
     * @param maxKeys The maximum number of keys to return. Default is 1000.
     * @returns A promise that resolves to an array of objects in the S3 bucket.
     * @throws S3BucketException if the operation fails.
     */
    async listObjects(prefix = '', maxKeys = 1000): Promise<_Object[]> {
        try {
            const command = new ListObjectsV2Command({
                Bucket: this.bucketName,
                Prefix: prefix,
                MaxKeys: maxKeys,
            });
            const response = await this.s3Client.send(command);
            return response.Contents || [];
        } catch (error) {
            logger.error(`Failed to list objects in S3: ${error}`);
            throw new S3BucketException('Failed to list objects in S3', error as Error);
        }
    }

    /**
     * Retrieves the metadata of an object in the S3 bucket.
     *
     * @param key The key of the object in the S3 bucket.
     * @returns A promise that resolves to the metadata of the object.
     * @throws S3BucketException if the operation fails.
     */
    async headObject(key: string): Promise<HeadObjectOutput> {
        try {
            const command = new HeadObjectCommand({
                Bucket: this.bucketName,
                Key: key,
            });
            return await this.s3Client.send(command);
        } catch (error) {
            logger.error(`Failed to head object from S3: ${error}`);
            throw new S3BucketException('Failed to head object from S3', error as Error);
        }
    }

    /**
     * Uploads an object to the specified S3 bucket.
     * If the content size is larger than 100MB
     * the object will be uploaded using multipart upload for better performance.
     *
     * @param key The object key (file name) in the S3 bucket.
     * @param body The content to be uploaded as a string, Buffer, or Readable stream.
     * @returns A promise that resolves when the object is successfully uploaded.
     * @throws S3BucketException if the operation fails.
     */
    async uploadObject(key: string, body: string | Buffer | Readable): Promise<void> {
        try {
            // Upload will use multipart upload if the content size is larger than 100MB,
            // otherwise it will use PutObject.
            const upload = new Upload({
                client: this.s3Client,
                params: {
                    Bucket: this.bucketName,
                    Key: key,
                    Body: body,
                },
                partSize: 1024 * 1024 * 100,
            });
            await upload.done();
        } catch (error) {
            logger.error(`Failed to upload object to S3: ${error}`);
            throw new S3BucketException('Failed to upload object to S3', error as Error);
        }
    }

    /**
     * Downloads an object from the S3 bucket.
     *
     * @param key The key of the object in the S3 bucket.
     * @returns A promise that resolves to a readable stream of the object's content.
     * @throws S3BucketException if the operation fails.
     */
    async downloadObject(key: string): Promise<Readable> {
        try {
            const command = new GetObjectCommand({
                Bucket: this.bucketName,
                Key: key,
            });
            const response = await this.s3Client.send(command);
            return response.Body as Readable;
        } catch (error) {
            logger.error(`Failed to download object from S3: ${error}`);
            throw new S3BucketException('Failed to download object from S3', error as Error);
        }
    }

    /**
     * Deletes an object from the S3 bucket.
     *
     * @param key The key of the object in the S3 bucket.
     * @returns A promise that resolves when the object is deleted.
     * @throws S3BucketException if the operation fails.
     */
    async deleteObject(key: string): Promise<void> {
        try {
            const command = new DeleteObjectCommand({
                Bucket: this.bucketName,
                Key: key,
            });
            await this.s3Client.send(command);
        } catch (error) {
            logger.error(`Failed to delete object from S3: ${error}`);
            throw new S3BucketException('Failed to delete object from S3', error as Error);
        }
    }

    /**
     * Generates a pre-signed URL for downloading an object from the S3 bucket.
     *
     * @param key The key of the object in the S3 bucket.
     * @param expiresIn The number of seconds the pre-signed URL is valid for. Default is 900 seconds (15 minutes).
     * @returns A promise that resolves to the pre-signed URL for download.
     * @throws S3BucketException if the operation fails.
     */
    async getPreSignedUrlDownload(key: string, expiresIn = 900): Promise<string> {
        try {
            const command = new GetObjectCommand({
                Bucket: this.bucketName,
                Key: key,
            });

            return getSignedUrl(this.s3Client, command, {
                expiresIn: expiresIn,
            });
        } catch (error) {
            logger.error(`Failed to get pre-signed url for download: ${error}`);
            throw new S3BucketException('Failed to get pre-signed url for download', error as Error);
        }
    }

    /**
     * Generates a pre-signed URL for uploading an object to the S3 bucket.
     *
     * @param key The key of the object in the S3 bucket.
     * @param expiresIn The number of seconds the pre-signed URL is valid for. Default is 900 seconds (15 minutes).
     * @returns A promise that resolves to the pre-signed URL for upload.
     * @throws S3BucketException if the operation fails.
     */
    async getPreSignedUrlForUpload(key: string, expiresIn = 900): Promise<string> {
        try {
            const command = new PutObjectCommand({
                Bucket: this.bucketName,
                Key: key,
            });

            return getSignedUrl(this.s3Client, command, {
                expiresIn: expiresIn,
            });
        } catch (error) {
            logger.error(`Failed to get pre-signed url for upload: ${error}`);
            throw new S3BucketException('Failed to get pre-signed url for upload', error as Error);
        }
    }
}
