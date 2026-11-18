/** Expõe os tipos de autenticação compartilhados pelos serviços HTTP. */
// Importações: reúnem bibliotecas, tipos e módulos locais usados pelos blocos seguintes.
import type { User } from '@motor-vtt/contracts';

// Exportação principal: `PublicUser` disponibiliza esta responsabilidade para os consumidores deste módulo.
export type PublicUser = User;

// Exportação principal: `RegisterInput` disponibiliza esta responsabilidade para os consumidores deste módulo.
export type RegisterInput = {
    nome: string;
    email: string;
    password: string;
};

// Exportação principal: `LoginInput` disponibiliza esta responsabilidade para os consumidores deste módulo.
export type LoginInput = {
    email: string;
    password: string;
};

// Exportação principal: `AuthServiceResponse` disponibiliza esta responsabilidade para os consumidores deste módulo.
export type AuthServiceResponse = {
    user: PublicUser;
    accessToken: string;
    accessTokenExpiresAt: string;
};

// Exportação principal: `RefreshSession` disponibiliza esta responsabilidade para os consumidores deste módulo.
export type RefreshSession = {
    id: string;
    userId: string;
    refreshToken: string;
    expiresAt: Date;
};
