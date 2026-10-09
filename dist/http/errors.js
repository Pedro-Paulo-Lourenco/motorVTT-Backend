export class HttpError extends Error {
    statusCode;
    code;
    details;
    constructor(statusCode, code, message, details) {
        super(message);
        this.name = 'HttpError';
        this.statusCode = statusCode;
        this.code = code;
        if (details !== undefined)
            this.details = details;
    }
}
//# sourceMappingURL=errors.js.map