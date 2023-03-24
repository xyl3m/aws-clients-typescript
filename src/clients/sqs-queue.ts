import { DeleteMessageCommand, Message, ReceiveMessageCommand, SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import logger from '../utils/logger';
import { SqsQueueException } from '../exceptions/sqs-queue-exception';

/**
 * SqsQueue class for managing AWS SQS operations.
 */
export class SqsQueue {
    private readonly sqsClient: SQSClient;
    private readonly queueUrl: string;
    private readonly deadLetterQueueUrl: string;

    /**
     * Constructor for the SqsQueue class.
     *
     * @param queueUrl The URL of the SQS.
     * @param deadLetterQueueUrl The URL of the DLQ.
     */
    constructor(queueUrl: string, deadLetterQueueUrl: string) {
        this.sqsClient = new SQSClient({
            region: queueUrl.split('.')[1],
        });
        this.queueUrl = queueUrl;
        this.deadLetterQueueUrl = deadLetterQueueUrl;
    }

    /**
     * Sends a message to the queue.
     *
     * @param messageBody The message body to send.
     */
    async sendMessage(messageBody: string): Promise<void> {
        try {
            const command = new SendMessageCommand({
                QueueUrl: this.queueUrl,
                MessageBody: messageBody,
            });
            await this.sqsClient.send(command);
        } catch (error) {
            logger.error(`Failed to send message to SQS queue: ${error}`);
            throw new SqsQueueException('Failed to send message', error as Error);
        }
    }

    /**
     * Deletes a message from the queue.
     *
     * @param message The Message object to delete.
     */
    async deleteMessage(message: Message): Promise<void> {
        try {
            const command = new DeleteMessageCommand({
                QueueUrl: this.queueUrl,
                ReceiptHandle: message.ReceiptHandle,
            });
            await this.sqsClient.send(command);
        } catch (error) {
            logger.error(`Failed to delete message from SQS queue: ${error}`);
            throw new SqsQueueException('Failed to delete message', error as Error);
        }
    }

    /**
     * Receives messages from the queue.
     *
     * @param maxNumberOfMessages The maximum number of messages to receive.
     * @return An array of received Message objects.
     */
    async receiveMessage(maxNumberOfMessages = 10): Promise<Message[]> {
        try {
            const command = new ReceiveMessageCommand({
                QueueUrl: this.queueUrl,
                MaxNumberOfMessages: maxNumberOfMessages,
                WaitTimeSeconds: 20,
            });
            const response = await this.sqsClient.send(command);
            return response.Messages || [];
        } catch (error) {
            logger.error(`Failed to receive message from SQS queue: ${error}`);
            throw new SqsQueueException('Failed to receive message', error as Error);
        }
    }

    /**
     * Sends a message to the dead-letter queue (DLQ) and deletes it from the original queue.
     *
     * @param message The Message object to send to the DLQ.
     */
    async sendMessageToDlq(message: Message): Promise<void> {
        try {
            await this.deleteMessage(message);
            const command = new SendMessageCommand({
                QueueUrl: this.deadLetterQueueUrl,
                MessageBody: message.Body,
            });
            await this.sqsClient.send(command);
        } catch (error) {
            if (error instanceof SqsQueueException) {
                logger.warn('Failed to send message to DLQ while deleting message from original queue');
                throw error;
            }
            logger.error(`Failed to send message to SQS DLQ: ${error}`);
            throw new SqsQueueException('Failed to send message to DLQ', error as Error);
        }
    }

    /**
     * Reschedules a message by deleting it from the queue and sending it back with a delay.
     *
     * @param message The Message object to reschedule.
     */
    async rescheduleMessage(message: Message): Promise<void> {
        try {
            await this.deleteMessage(message);
            const command = new SendMessageCommand({
                QueueUrl: this.queueUrl,
                MessageBody: message.Body,
                DelaySeconds: 30,
            });
            await this.sqsClient.send(command);
        } catch (error) {
            if (error instanceof SqsQueueException) {
                logger.warn('Failed to reschedule message while deleting message from queue');
                throw error;
            }
            logger.error(`Failed to reschedule message: ${error}`);
            throw new SqsQueueException('Failed to reschedule message', error as Error);
        }
    }
}
