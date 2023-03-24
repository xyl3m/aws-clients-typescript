import { mockClient } from 'aws-sdk-client-mock';
import { Message, SQSClient, SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { SqsQueue } from '../sqs-queue';
import logger from '../../utils/logger';
import { SqsQueueException } from '../../exceptions/sqs-queue-exception';

const queueUrl = 'https://sqs.region.amazonaws.com/123456789012/MyQueue';
const deadLetterQueueUrl = 'https://sqs.region.amazonaws.com/123456789012/MyQueue-dlq';

jest.mock('../../utils/logger', () => ({
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
}));

const mockedSqsClient = mockClient(SQSClient);
const sqsQueue = new SqsQueue(queueUrl, deadLetterQueueUrl);

const testMessageBody = 'Hello, SQS!';
const testMessage: Message = {
    MessageId: 'test-message-id',
    ReceiptHandle: 'test-receipt-handle',
    Body: testMessageBody,
};

afterAll(() => {
    mockedSqsClient.restore();
});

describe('SqsQueue', () => {
    beforeEach(() => {
        mockedSqsClient.reset();
        jest.clearAllMocks();
    });

    test('should send a message', async () => {
        const request = {
            QueueUrl: queueUrl,
            MessageBody: testMessageBody,
        };
        mockedSqsClient.on(SendMessageCommand, request).resolves({});

        await sqsQueue.sendMessage(testMessageBody);

        expect(mockedSqsClient.calls()).toHaveLength(1);
        expect(mockedSqsClient.calls()[0].args[0].input).toMatchObject(request);
    });

    test('should receive messages', async () => {
        const request = {
            QueueUrl: queueUrl,
            MaxNumberOfMessages: 10,
            WaitTimeSeconds: 20,
        };
        mockedSqsClient.on(ReceiveMessageCommand, request).resolves({
            Messages: [testMessage],
        });

        const messages = await sqsQueue.receiveMessage();

        expect(mockedSqsClient.calls()).toHaveLength(1);
        expect(mockedSqsClient.calls()[0].args[0].input).toMatchObject(request);
        expect(messages).toHaveLength(1);
        expect(messages[0]).toEqual(testMessage);
    });

    test('should delete a message', async () => {
        const request = {
            QueueUrl: queueUrl,
            ReceiptHandle: testMessage.ReceiptHandle,
        };
        mockedSqsClient.on(DeleteMessageCommand, request).resolves({});

        await sqsQueue.deleteMessage(testMessage);

        expect(mockedSqsClient.calls()).toHaveLength(1);
        expect(mockedSqsClient.calls()[0].args[0].input).toMatchObject(request);
    });

    test('should send a message to DLQ', async () => {
        const deleteRequest = {
            QueueUrl: queueUrl,
            ReceiptHandle: testMessage.ReceiptHandle,
        };
        const sendRequest = {
            QueueUrl: deadLetterQueueUrl,
            MessageBody: testMessage.Body,
        };
        mockedSqsClient.on(DeleteMessageCommand, deleteRequest).resolves({}).on(SendMessageCommand, sendRequest).resolves({});

        await sqsQueue.sendMessageToDlq(testMessage);

        expect(mockedSqsClient.calls()).toHaveLength(2);
        expect(mockedSqsClient.calls()[0].args[0].input).toMatchObject(deleteRequest);
        expect(mockedSqsClient.calls()[1].args[0].input).toMatchObject(sendRequest);
    });

    test('should reschedule a message', async () => {
        const deleteRequest = {
            QueueUrl: queueUrl,
            ReceiptHandle: testMessage.ReceiptHandle,
        };
        const sendRequest = {
            QueueUrl: queueUrl,
            MessageBody: testMessage.Body,
            DelaySeconds: 30,
        };
        mockedSqsClient.on(DeleteMessageCommand, deleteRequest).resolves({}).on(SendMessageCommand, sendRequest).resolves({});

        await sqsQueue.rescheduleMessage(testMessage);

        expect(mockedSqsClient.calls()).toHaveLength(2);
        expect(mockedSqsClient.calls()[0].args[0].input).toMatchObject(deleteRequest);
        expect(mockedSqsClient.calls()[1].args[0].input).toMatchObject(sendRequest);
    });

    test('should throw an error when sending a message fails', async () => {
        mockedSqsClient
            .on(SendMessageCommand, {
                QueueUrl: queueUrl,
                MessageBody: testMessageBody,
            })
            .rejects(new Error('Send message failed'));

        await expect(sqsQueue.sendMessage(testMessageBody)).rejects.toThrow(SqsQueueException);
    });

    test('should throw an error when deleting a message fails', async () => {
        mockedSqsClient
            .on(DeleteMessageCommand, {
                QueueUrl: queueUrl,
                ReceiptHandle: testMessage.ReceiptHandle,
            })
            .rejects(new Error('Delete message failed'));

        await expect(sqsQueue.deleteMessage(testMessage)).rejects.toThrow(SqsQueueException);
    });

    test('should throw an error when receiving messages fails', async () => {
        mockedSqsClient
            .on(ReceiveMessageCommand, {
                QueueUrl: queueUrl,
                MaxNumberOfMessages: 10,
                WaitTimeSeconds: 20,
            })
            .rejects(new Error('Receive message failed'));

        await expect(sqsQueue.receiveMessage()).rejects.toThrow(SqsQueueException);
    });

    test('should throw an error when sending a message to the DLQ fails', async () => {
        mockedSqsClient
            .on(DeleteMessageCommand, {
                QueueUrl: queueUrl,
                ReceiptHandle: testMessage.ReceiptHandle,
            })
            .resolves({});
        mockedSqsClient
            .on(SendMessageCommand, {
                QueueUrl: deadLetterQueueUrl,
                MessageBody: testMessage.Body,
            })
            .rejects(new Error('Send message to DLQ failed'));

        await expect(sqsQueue.sendMessageToDlq(testMessage)).rejects.toThrow(SqsQueueException);
    });

    test('should throw an error when rescheduling a message fails', async () => {
        mockedSqsClient
            .on(DeleteMessageCommand, {
                QueueUrl: queueUrl,
                ReceiptHandle: testMessage.ReceiptHandle,
            })
            .resolves({});
        mockedSqsClient
            .on(SendMessageCommand, {
                QueueUrl: queueUrl,
                MessageBody: testMessage.Body,
                DelaySeconds: 30,
            })
            .rejects(new Error('Reschedule message failed'));

        await expect(sqsQueue.rescheduleMessage(testMessage)).rejects.toThrow(SqsQueueException);
    });

    test('should log a warning when sending a message to the DLQ fails during message deletion', async () => {
        const error = new SqsQueueException('Failed to delete message', new Error('Delete message failed'));
        mockedSqsClient
            .on(DeleteMessageCommand, {
                QueueUrl: queueUrl,
                ReceiptHandle: testMessage.ReceiptHandle,
            })
            .rejects(error);

        await expect(sqsQueue.sendMessageToDlq(testMessage)).rejects.toThrow(SqsQueueException);

        expect(logger.warn).toHaveBeenCalledWith('Failed to send message to DLQ while deleting message from original queue');
    });

    test('should log a warning when rescheduling a message fails during message deletion', async () => {
        const error = new SqsQueueException('Failed to delete message', new Error('Delete message failed'));
        mockedSqsClient
            .on(DeleteMessageCommand, {
                QueueUrl: queueUrl,
                ReceiptHandle: testMessage.ReceiptHandle,
            })
            .rejects(error);

        await expect(sqsQueue.rescheduleMessage(testMessage)).rejects.toThrow(SqsQueueException);

        expect(logger.warn).toHaveBeenCalledWith('Failed to reschedule message while deleting message from queue');
    });

    test('should receive an empty array when there are no messages in the queue', async () => {
        const request = {
            QueueUrl: queueUrl,
            MaxNumberOfMessages: 10,
            WaitTimeSeconds: 20,
        };
        mockedSqsClient.on(ReceiveMessageCommand, request).resolves({
            Messages: [],
        });

        const messages = await sqsQueue.receiveMessage();

        expect(messages).toHaveLength(0);
        expect(mockedSqsClient.calls()).toHaveLength(1);
        expect(mockedSqsClient.calls()[0].args[0].input).toMatchObject(request);
    });

    test('should receive an empty array when response.Messages is undefined', async () => {
        const request = {
            QueueUrl: queueUrl,
            MaxNumberOfMessages: 10,
            WaitTimeSeconds: 20,
        };
        mockedSqsClient.on(ReceiveMessageCommand, request).resolves({});

        const messages = await sqsQueue.receiveMessage();

        expect(messages).toHaveLength(0);
        expect(mockedSqsClient.calls()).toHaveLength(1);
        expect(mockedSqsClient.calls()[0].args[0].input).toMatchObject(request);
    });
});
