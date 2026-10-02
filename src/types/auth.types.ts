export type UserStatus = 'PENDENTE' | 'ATIVO' | 'BLOQUEADO';

export type PublicUser = {
    id: string;
    nome: string;
    email: string;
    status: UserStatus;
    ultimoLogin: string | null;
    createdAt: string;
    updatedAt: string;
};

export type RegisterInput = {
    nome: string;
    email: string;
    password: string;
};

export type LoginInput = {
    email: string;
    password: string;
};

export type AuthResponse = {
    user: PublicUser;
    accessToken: string;
    accessTokenExpiresAt: string;
};

export type RefreshSession = {
    id: string;
    userId: string;
    refreshToken: string;
    expiresAt: Date;
};
