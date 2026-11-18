/** Expõe os tipos de autenticação compartilhados pelos serviços HTTP. */
// Dependências deste módulo: cada importação fornece recursos, tipos ou integrações usados na implementação abaixo.
import type { User } from '@motor-vtt/contracts';

// API pública do módulo: `PublicUser` define a interface pública consumida pelos demais módulos.
export type PublicUser = User;

// API pública do módulo: `RegisterInput` define a interface pública consumida pelos demais módulos.
export type RegisterInput = {
    nome: string;
    email: string;
    password: string;
};

// API pública do módulo: `LoginInput` define a interface pública consumida pelos demais módulos.
export type LoginInput = {
    email: string;
    password: string;
};

// API pública do módulo: `AuthServiceResponse` define a interface pública consumida pelos demais módulos.
export type AuthServiceResponse = {
    user: PublicUser;
    accessToken: string;
    accessTokenExpiresAt: string;
};

// API pública do módulo: `RefreshSession` define a interface pública consumida pelos demais módulos.
export type RefreshSession = {
    id: string;
    userId: string;
    refreshToken: string;
    expiresAt: Date;
};
