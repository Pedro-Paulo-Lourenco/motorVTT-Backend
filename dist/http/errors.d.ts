export declare class HttpError extends Error {
    readonly statusCode: number;
    readonly code: string;
    readonly details?: Record<string, unknown>;
    constructor(statusCode: number, code: string, message: string, details?: Record<string, unknown>);
}
//# sourceMappingURL=errors.d.ts.map