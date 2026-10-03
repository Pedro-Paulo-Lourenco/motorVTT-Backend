import type { User } from '@motor-vtt/contracts';

export type PublicUser = User;

export type RegisterInput = {
    nome: string;
    email: string;
    password: string;
};

export type LoginInput = {
    email: string;
    password: string;
};

export type AuthServiceResponse = {
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
