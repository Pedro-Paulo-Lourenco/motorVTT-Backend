import { z } from 'zod';
export declare const registerSchema: z.ZodObject<{
    nome: z.ZodString;
    email: z.ZodPipe<z.ZodString, z.ZodString>;
    password: z.ZodString;
}, z.core.$strip>;
export declare const loginSchema: z.ZodObject<{
    email: z.ZodPipe<z.ZodString, z.ZodString>;
    password: z.ZodString;
}, z.core.$strip>;
export type RegisterBody = z.infer<typeof registerSchema>;
export type LoginBody = z.infer<typeof loginSchema>;
//# sourceMappingURL=auth.schemas.d.ts.map