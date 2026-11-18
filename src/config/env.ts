/** Carrega, valida e tipa a configuração antes de qualquer efeito de inicialização. */
// Importações: reúnem bibliotecas, tipos e módulos locais usados pelos blocos seguintes.
import { config as loadDotenv } from 'dotenv';

// Constante ou estado local: `environmentFile` mantém o dado necessário ao fluxo abaixo.
const environmentFile = `.env.${process.env.NODE_ENV ?? 'development'}`;
loadDotenv({
    path: process.env.DOTENV_CONFIG_PATH ?? process.env.dotenv_config_path ?? environmentFile,
});
loadDotenv({ path: '.env' });

import { z } from 'zod';

// Constante ou estado local: `optionalNonEmptyString` mantém o dado necessário ao fluxo abaixo.
const optionalNonEmptyString = z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(1).optional(),
);

// Constante ou estado local: `optionalUrl` mantém o dado necessário ao fluxo abaixo.
const optionalUrl = z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().url().optional(),
);

// Constante ou estado local: `environmentSchema` mantém o dado necessário ao fluxo abaixo.
const environmentSchema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    APP_URL: z.string().url().default('http://localhost:3000'),
    CORS_ORIGIN: z.string().url().default('http://localhost:5173'),

    DATABASE_URL: optionalUrl,
    DB_HOST: z.string().min(1).default('localhost'),
    DB_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
    DB_USER: z.string().min(1).default('motor_vtt'),
    DB_PASS: z.string().optional(),
    DB_NAME: z.string().min(1).default('motor_vtt'),

    JWT_SECRET: z.preprocess(
        (value) => (value === '' ? undefined : value),
        z.string().min(32),
    ),
    JWT_EXPIRES_IN: z.string().min(1).default('1d'),
    COOKIE_SECRET: z.preprocess(
        (value) => (value === '' ? undefined : value),
        z.string().min(32).optional(),
    ),
    REFRESH_TOKEN_EXPIRES_IN: z.string().regex(/^[1-9]\d*[smhd]$/).default('7d'),

    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    EMAIL_FROM: z.string().email().optional(),

    REDIS_URL: z.string().url().optional(),

    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    STORAGE_PATH: z.string().min(1).default('./storage'),
    TABLETOP_BACKGROUND_URL: optionalUrl,
    TABLETOP_GRID_SIZE: z.coerce.number().int().positive().default(64),
    S3_BUCKET: optionalNonEmptyString,
    S3_REGION: optionalNonEmptyString,
    S3_ENDPOINT: optionalUrl,
    S3_ACCESS_KEY_ID: optionalNonEmptyString,
    S3_SECRET_ACCESS_KEY: optionalNonEmptyString,
});

// Exportação principal: `Environment` disponibiliza esta responsabilidade para os consumidores deste módulo.
export type Environment = z.infer<typeof environmentSchema>;

// Constante ou estado local: `result` mantém o dado necessário ao fluxo abaixo.
const result = environmentSchema.safeParse(process.env);

// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
if (!result.success) {
// Constante ou estado local: `details` mantém o dado necessário ao fluxo abaixo.
    const details = result.error.issues
        .map((issue) => {
// Constante ou estado local: `variable` mantém o dado necessário ao fluxo abaixo.
            const variable = issue.path.join('.') || 'configuração';
            return `- ${variable}: ${issue.message}`;
        })
        .join('\n');

    console.error(`\nConfiguração de ambiente inválida:\n${details}\n`);
    process.exit(1);
}

// Exportação principal: `env` disponibiliza esta responsabilidade para os consumidores deste módulo.
export const env: Environment = result.data;
