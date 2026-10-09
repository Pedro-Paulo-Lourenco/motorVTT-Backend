import type { Response } from 'express';
import type { ApiResponse, HttpLocals } from './types.js';
export declare function sendSuccess<T>(res: Response<ApiResponse<T>, HttpLocals>, status: number, data: T, message?: string): void;
export declare function sendError(res: Response<ApiResponse<never>, HttpLocals>, status: number, code: string, message: string, details?: Record<string, unknown>): void;
//# sourceMappingURL=response.d.ts.map