/** Define os schemas Zod dos payloads de autenticação. */
// Dependências deste módulo: cada importação fornece recursos, tipos ou integrações usados na implementação abaixo.
import { z } from 'zod';
import { userSchema } from '@motor-vtt/contracts';

// Estado intermediário: `emailSchema` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
const emailSchema = z.string().trim().toLowerCase().pipe(userSchema.shape.email);

// Estado intermediário: `passwordSchema` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
const passwordSchema = z.string()
    .min(12, 'A senha deve ter pelo menos 12 caracteres.')
    .max(128, 'A senha deve ter no máximo 128 caracteres.')
    .refine((password) => Buffer.byteLength(password, 'utf8') <= 72, 'A senha deve ter no máximo 72 bytes em UTF-8.')
    .regex(/[a-z]/, 'A senha deve conter uma letra minúscula.')
    .regex(/[A-Z]/, 'A senha deve conter uma letra maiúscula.')
    .regex(/\d/, 'A senha deve conter um número.')
    .regex(/[^A-Za-z0-9]/, 'A senha deve conter um símbolo.');

// API pública do módulo: `registerSchema` define a interface pública consumida pelos demais módulos.
export const registerSchema = z.object({
    nome: userSchema.shape.nome,
    email: emailSchema,
    password: passwordSchema,
});

// API pública do módulo: `loginSchema` define a interface pública consumida pelos demais módulos.
export const loginSchema = z.object({
    email: emailSchema,
    password: z.string().min(1).max(128),
});

// API pública do módulo: `RegisterBody` define a interface pública consumida pelos demais módulos.
export type RegisterBody = z.infer<typeof registerSchema>;
// API pública do módulo: `LoginBody` define a interface pública consumida pelos demais módulos.
export type LoginBody = z.infer<typeof loginSchema>;
