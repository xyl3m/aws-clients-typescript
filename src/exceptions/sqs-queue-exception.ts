export class SqsQueueException extends Error {
    constructor(message: string, public readonly cause?: Error) {
        super(message);
        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }
}
