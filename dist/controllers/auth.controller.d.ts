import type { Request, Response } from 'express';
import { type AuthResponse } from '@motor-vtt/contracts';
import type { ApiResponse, ValidatedLocals } from '../http/types.js';
import type { LoginBody, RegisterBody } from '../routes/auth.schemas.js';
export declare function register(_req: Request, res: Response<ApiResponse<AuthResponse>, ValidatedLocals<RegisterBody, undefined, undefined>>): Promise<void>;
export declare function login(_req: Request, res: Response<ApiResponse<AuthResponse>, ValidatedLocals<LoginBody, undefined, undefined>>): Promise<void>;
export declare function refresh(req: Request, res: Response<ApiResponse<AuthResponse>>): Promise<void>;
export declare function me(req: Request, res: Response<ApiResponse<unknown>>): Promise<void>;
export declare function logout(req: Request, res: Response<ApiResponse<Record<string, never>>>): Promise<void>;
//# sourceMappingURL=auth.controller.d.ts.map