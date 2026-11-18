/** Define os schemas Zod dos payloads de autenticação. */
// Importações: reúnem bibliotecas, tipos e módulos locais usados pelos blocos seguintes.
import { z } from 'zod';
import { userSchema } from '@motor-vtt/contracts';

// Constante ou estado local: `emailSchema` mantém o dado necessário ao fluxo abaixo.
const emailSchema = z.string().trim().toLowerCase().pipe(userSchema.shape.email);

// Constante ou estado local: `passwordSchema` mantém o dado necessário ao fluxo abaixo.
const passwordSchema = z.string()
    .min(12, 'A senha deve ter pelo menos 12 caracteres.')
    .max(128, 'A senha deve ter no máximo 128 caracteres.')
    .refine((password) => Buffer.byteLength(password, 'utf8') <= 72, 'A senha deve ter no máximo 72 bytes em UTF-8.')
    .regex(/[a-z]/, 'A senha deve conter uma letra minúscula.')
    .regex(/[A-Z]/, 'A senha deve conter uma letra maiúscula.')
    .regex(/\d/, 'A senha deve conter um número.')
    .regex(/[^A-Za-z0-9]/, 'A senha deve conter um símbolo.');

// Exportação principal: `registerSchema` disponibiliza esta responsabilidade para os consumidores deste módulo.
export const registerSchema = z.object({
    nome: userSchema.shape.nome,
    email: emailSchema,
    password: passwordSchema,
});

// Exportação principal: `loginSchema` disponibiliza esta responsabilidade para os consumidores deste módulo.
export const loginSchema = z.object({
    email: emailSchema,
    password: z.string().min(1).max(128),
});

// Exportação principal: `RegisterBody` disponibiliza esta responsabilidade para os consumidores deste módulo.
export type RegisterBody = z.infer<typeof registerSchema>;
// Exportação principal: `LoginBody` disponibiliza esta responsabilidade para os consumidores deste módulo.
export type LoginBody = z.infer<typeof loginSchema>;
