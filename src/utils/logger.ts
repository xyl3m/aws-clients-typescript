import { createLogger, format, transports, Logger } from 'winston';

const { combine, timestamp, logstash } = format;

const logger: Logger = createLogger({
    level: 'info',
    format: combine(
        timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }), // ISO8601 format
        logstash(), // Logstash format
    ),
    transports: [
        new transports.Console(),
        // Add other transports if required, e.g., new transports.File({ filename: 'combined.log' })
    ],
});

export default logger;
