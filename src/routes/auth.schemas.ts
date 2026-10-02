import { z } from 'zod';

const emailSchema = z.string().trim().toLowerCase().email().max(255);

const passwordSchema = z.string()
    .min(12, 'A senha deve ter pelo menos 12 caracteres.')
    .max(128, 'A senha deve ter no máximo 128 caracteres.')
    .regex(/[a-z]/, 'A senha deve conter uma letra minúscula.')
    .regex(/[A-Z]/, 'A senha deve conter uma letra maiúscula.')
    .regex(/\d/, 'A senha deve conter um número.')
    .regex(/[^A-Za-z0-9]/, 'A senha deve conter um símbolo.');

export const registerSchema = z.object({
    nome: z.string().trim().min(1).max(120),
    email: emailSchema,
    password: passwordSchema,
});

export const loginSchema = z.object({
    email: emailSchema,
    password: z.string().min(1).max(128),
});

export type RegisterBody = z.infer<typeof registerSchema>;
export type LoginBody = z.infer<typeof loginSchema>;
