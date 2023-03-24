import { mockClient } from 'aws-sdk-client-mock';
import {
    CompleteMultipartUploadCommand,
    CreateMultipartUploadCommand,
    DeleteObjectCommand,
    GetObjectCommand,
    GetObjectCommandOutput,
    HeadObjectCommand,
    ListObjectsV2Command,
    PutObjectCommand,
    S3Client,
    UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3Bucket } from '../s3-bucket';
import logger from '../../utils/logger';
import { S3BucketException } from '../../exceptions/s3-bucket-exception';
import { PassThrough, Readable } from 'stream';

const region = 'region';
const bucketName = 'testBucket';
const multipartUploadSizeThreshold = 100 * 1024 * 1024; // 100 MB

jest.mock('../../utils/logger', () => ({
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
    getSignedUrl: jest.fn(),
}));

const mockedS3Client = mockClient(S3Client);
const s3Bucket = new S3Bucket(region, bucketName);

afterAll(() => {
    mockedS3Client.restore();
});

describe('S3Bucket', () => {
    beforeEach(() => {
        mockedS3Client.reset();
        jest.clearAllMocks();
    });

    test('listObjects should return objects when successful', async () => {
        const prefix = 'test/';
        const maxKeys = 10;
        const expectedObjects = [
            { Key: 'test/object1', Size: 100 },
            { Key: 'test/object2', Size: 200 },
        ];
        const request = {
            Bucket: bucketName,
            Prefix: prefix,
            MaxKeys: maxKeys,
        };

        mockedS3Client.on(ListObjectsV2Command, request).resolves({ Contents: expectedObjects });

        const objects = await s3Bucket.listObjects(prefix, maxKeys);

        expect(mockedS3Client.calls()).toHaveLength(1);
        expect(mockedS3Client.calls()[0].args[0].input).toMatchObject(request);
        expect(objects).toEqual(expectedObjects);
    });

    test('headObject should return object metadata when successful', async () => {
        const key = 'test/object1';
        const expectedMetadata = { ContentLength: 100, ContentType: 'application/octet-stream' };
        const request = {
            Bucket: bucketName,
            Key: key,
        };

        mockedS3Client.on(HeadObjectCommand, request).resolves(expectedMetadata);

        const metadata = await s3Bucket.headObject(key);

        expect(mockedS3Client.calls()).toHaveLength(1);
        expect(mockedS3Client.calls()[0].args[0].input).toMatchObject(request);
        expect(metadata).toEqual(expectedMetadata);
    });

    test('uploadObject should upload an object when successful', async () => {
        const key = 'test/object1';
        const body = 'test data';
        const request = {
            Bucket: bucketName,
            Key: key,
            Body: body,
        };

        mockedS3Client.on(PutObjectCommand, request).resolves({});

        await s3Bucket.uploadObject(key, body);

        expect(mockedS3Client.calls()).toHaveLength(1);
        expect(mockedS3Client.calls()[0].args[0]).toBeInstanceOf(PutObjectCommand);
        expect(mockedS3Client.calls()[0].args[0].input).toMatchObject({
            Bucket: bucketName,
            Key: key,
            Body: Buffer.from(body),
        });
    });

    test('downloadObject should return a readable stream when successful', async () => {
        const key = 'test/object1';
        const body = 'test data';
        const readableStream = Readable.from(body);
        const request = {
            Bucket: bucketName,
            Key: key,
        };

        mockedS3Client.on(GetObjectCommand, request).resolves({ Body: readableStream } as GetObjectCommandOutput);

        const downloadedStream = await s3Bucket.downloadObject(key);

        const chunks = [];
        for await (const chunk of downloadedStream) {
            chunks.push(Buffer.from(chunk));
        }
        const downloadedData = Buffer.concat(chunks).toString('utf8');

        expect(mockedS3Client.calls()).toHaveLength(1);
        expect(mockedS3Client.calls()[0].args[0].input).toMatchObject(request);
        expect(downloadedData).toBe(body);
    });

    test('deleteObject should delete an object when successful', async () => {
        const key = 'test/object1';
        const request = {
            Bucket: bucketName,
            Key: key,
        };

        mockedS3Client.on(DeleteObjectCommand, request).resolves({});

        await s3Bucket.deleteObject(key);

        expect(mockedS3Client.calls()).toHaveLength(1);
        expect(mockedS3Client.calls()[0].args[0].input).toMatchObject(request);
    });

    test('getPreSignedUrlDownload should return a pre-signed URL when successful', async () => {
        const key = 'test/object1';
        const preSignedUrl = 'https://example.com/presigned-download-url';

        (getSignedUrl as jest.Mock).mockResolvedValue(preSignedUrl);

        const resultUrl = await s3Bucket.getPreSignedUrlDownload(key);

        expect(resultUrl).toBe(preSignedUrl);
    });

    test('getPreSignedUrlForUpload should return a pre-signed URL when successful', async () => {
        const key = 'test/object1';
        const preSignedUrl = 'https://example.com/presigned-upload-url';

        (getSignedUrl as jest.Mock).mockResolvedValue(preSignedUrl);

        const resultUrl = await s3Bucket.getPreSignedUrlForUpload(key);

        expect(resultUrl).toBe(preSignedUrl);
    });

    test('getPreSignedUrlDownload should return a pre-signed URL with specified expiration when successful', async () => {
        const key = 'test/object1';
        const expiresIn = 600;
        const preSignedUrl = 'https://example.com/presigned-download-url';

        (getSignedUrl as jest.Mock).mockResolvedValue(preSignedUrl);

        const resultUrl = await s3Bucket.getPreSignedUrlDownload(key, expiresIn);

        expect(resultUrl).toBe(preSignedUrl);
        // cannot assert on the expiration because `getSignedUrl` is middleware which has no result object
    });

    test('getPreSignedUrlForUpload should return a pre-signed URL specified expiration when successful', async () => {
        const key = 'test/object1';
        const expiresIn = 600;
        const preSignedUrl = 'https://example.com/presigned-upload-url';

        (getSignedUrl as jest.Mock).mockResolvedValue(preSignedUrl);

        const resultUrl = await s3Bucket.getPreSignedUrlForUpload(key, expiresIn);

        expect(resultUrl).toBe(preSignedUrl);
        // cannot assert on the expiration because `getSignedUrl` is middleware which has no result object
    });

    test('listObjects should throw an error when fails', async () => {
        const prefix = 'test/';
        const maxKeys = 10;
        mockedS3Client
            .on(ListObjectsV2Command, {
                Bucket: bucketName,
                Prefix: prefix,
                MaxKeys: maxKeys,
            })
            .rejects(new Error('List objects failed'));

        await expect(s3Bucket.listObjects(prefix, maxKeys)).rejects.toThrow(S3BucketException);
        expect(logger.error).toHaveBeenCalledWith('Failed to list objects in S3: Error: List objects failed');
    });

    test('headObject should throw an error when fails', async () => {
        const key = 'test/object1';

        mockedS3Client
            .on(HeadObjectCommand, {
                Bucket: bucketName,
                Key: key,
            })
            .rejects(new Error('Head object failed'));

        await expect(s3Bucket.headObject(key)).rejects.toThrow(S3BucketException);
        expect(logger.error).toHaveBeenCalledWith('Failed to head object from S3: Error: Head object failed');
    });

    test('uploadObject should throw an error when fails', async () => {
        const key = 'test/object1';
        const body = 'test data';

        mockedS3Client.on(PutObjectCommand).rejects(new Error('Upload object failed'));

        await expect(s3Bucket.uploadObject(key, body)).rejects.toThrow(S3BucketException);
        expect(logger.error).toHaveBeenCalledWith('Failed to upload object to S3: Error: Upload object failed');
    });

    test('downloadObject should throw an error when fails', async () => {
        const key = 'test/object1';

        mockedS3Client
            .on(GetObjectCommand, {
                Bucket: bucketName,
                Key: key,
            })
            .rejects(new Error('Download object failed'));

        await expect(s3Bucket.downloadObject(key)).rejects.toThrow(S3BucketException);
        expect(logger.error).toHaveBeenCalledWith('Failed to download object from S3: Error: Download object failed');
    });

    test('deleteObject should throw an error when fails', async () => {
        const key = 'test/object1';

        mockedS3Client
            .on(DeleteObjectCommand, {
                Bucket: bucketName,
                Key: key,
            })
            .rejects(new Error('Delete object failed'));

        await expect(s3Bucket.deleteObject(key)).rejects.toThrow(S3BucketException);
        expect(logger.error).toHaveBeenCalledWith('Failed to delete object from S3: Error: Delete object failed');
    });

    test('getPreSignedUrlDownload should throw an error when fails', async () => {
        const key = 'test/object1';
        const expiresIn = 900;

        (getSignedUrl as jest.Mock).mockImplementation(() => {
            throw new Error('Get pre-signed URL failed');
        });

        await expect(s3Bucket.getPreSignedUrlDownload(key, expiresIn)).rejects.toThrow(S3BucketException);
        expect(logger.error).toHaveBeenCalledWith('Failed to get pre-signed url for download: Error: Get pre-signed URL failed');
    });

    test('getPreSignedUrlForUpload should throw an error when fails', async () => {
        const key = 'test/object1';
        const expiresIn = 900;

        (getSignedUrl as jest.Mock).mockImplementation(() => {
            throw new Error('Get pre-signed URL failed');
        });

        await expect(s3Bucket.getPreSignedUrlForUpload(key, expiresIn)).rejects.toThrow(S3BucketException);
        expect(logger.error).toHaveBeenCalledWith('Failed to get pre-signed url for upload: Error: Get pre-signed URL failed');
    });

    test('uploadObject should use multipart upload for large String', async () => {
        const key = 'test/large-object';
        const body = 'a'.repeat(multipartUploadSizeThreshold + 1);

        mockedS3Client.on(CreateMultipartUploadCommand).resolves({ UploadId: 'upload-id' });
        mockedS3Client.on(UploadPartCommand).resolves({ ETag: 'etag' });

        await s3Bucket.uploadObject(key, body);

        const callLength = mockedS3Client.calls().length;
        expect(mockedS3Client.calls().length).toBeGreaterThanOrEqual(3);
        expect(mockedS3Client.calls()[0].args[0]).toBeInstanceOf(CreateMultipartUploadCommand);
        for (let i = 1; i < callLength - 1; i++) {
            expect(mockedS3Client.calls()[i].args[0]).toBeInstanceOf(UploadPartCommand);
        }
        expect(mockedS3Client.calls()[callLength - 1].args[0]).toBeInstanceOf(CompleteMultipartUploadCommand);
    });

    test('uploadObject should use multipart upload for large Buffer', async () => {
        const key = 'test/large-object';
        const body = Buffer.alloc(multipartUploadSizeThreshold + 1, 'a');

        mockedS3Client.on(CreateMultipartUploadCommand).resolves({ UploadId: 'upload-id' });
        mockedS3Client.on(UploadPartCommand).resolves({ ETag: 'etag' });

        await s3Bucket.uploadObject(key, body);

        const callLength = mockedS3Client.calls().length;
        expect(mockedS3Client.calls().length).toBeGreaterThanOrEqual(3);
        expect(mockedS3Client.calls()[0].args[0]).toBeInstanceOf(CreateMultipartUploadCommand);
        for (let i = 1; i < callLength - 1; i++) {
            expect(mockedS3Client.calls()[i].args[0]).toBeInstanceOf(UploadPartCommand);
        }
        expect(mockedS3Client.calls()[callLength - 1].args[0]).toBeInstanceOf(CompleteMultipartUploadCommand);
    });

    test('uploadObject should use multipart upload for large Readable', async () => {
        const key = 'test/large-object';
        const largeBuffer = Buffer.alloc(multipartUploadSizeThreshold + 1, 'a');
        const body = new PassThrough();
        body.end(largeBuffer);

        mockedS3Client.on(CreateMultipartUploadCommand).resolves({ UploadId: 'upload-id' });
        mockedS3Client.on(UploadPartCommand).resolves({ ETag: 'etag' });

        await s3Bucket.uploadObject(key, body);

        const callLength = mockedS3Client.calls().length;
        expect(mockedS3Client.calls().length).toBeGreaterThanOrEqual(3);
        expect(mockedS3Client.calls()[0].args[0]).toBeInstanceOf(CreateMultipartUploadCommand);
        for (let i = 1; i < callLength - 1; i++) {
            expect(mockedS3Client.calls()[i].args[0]).toBeInstanceOf(UploadPartCommand);
        }
        expect(mockedS3Client.calls()[callLength - 1].args[0]).toBeInstanceOf(CompleteMultipartUploadCommand);
    });

    test('listObjects should return empty array when there is no objects', async () => {
        const request = {
            Bucket: bucketName,
        };

        mockedS3Client.on(ListObjectsV2Command, request).resolves({ Contents: [] });

        const objects = await s3Bucket.listObjects();

        expect(mockedS3Client.calls()).toHaveLength(1);
        expect(mockedS3Client.calls()[0].args[0].input).toMatchObject(request);
        expect(objects).toEqual([]);
    });

    test('listObjects should return empty array when response.Contents is undefined', async () => {
        const request = {
            Bucket: bucketName,
        };

        mockedS3Client.on(ListObjectsV2Command, request).resolves({});

        const objects = await s3Bucket.listObjects();

        expect(mockedS3Client.calls()).toHaveLength(1);
        expect(mockedS3Client.calls()[0].args[0].input).toMatchObject(request);
        expect(objects).toEqual([]);
    });
});
