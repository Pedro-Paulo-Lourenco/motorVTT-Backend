export class HttpError extends Error {
    public readonly statusCode: number;
    public readonly code: string;
    public readonly details?: Record<string, unknown>;

    public constructor(
        statusCode: number,
        code: string,
        message: string,
        details?: Record<string, unknown>,
    ) {
        super(message);
        this.name = 'HttpError';
        this.statusCode = statusCode;
        this.code = code;
        if (details !== undefined) this.details = details;
    }
}
