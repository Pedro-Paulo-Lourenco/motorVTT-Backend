import { config as loadDotenv } from 'dotenv';

const environmentFile = `.env.${process.env.NODE_ENV ?? 'development'}`;
loadDotenv({
    path: process.env.DOTENV_CONFIG_PATH ?? process.env.dotenv_config_path ?? environmentFile,
});
loadDotenv({ path: '.env' });

import { z } from 'zod';

const optionalNonEmptyString = z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(1).optional(),
);

const optionalUrl = z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().url().optional(),
);

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
    S3_BUCKET: optionalNonEmptyString,
    S3_REGION: optionalNonEmptyString,
    S3_ENDPOINT: optionalUrl,
    S3_ACCESS_KEY_ID: optionalNonEmptyString,
    S3_SECRET_ACCESS_KEY: optionalNonEmptyString,
});

export type Environment = z.infer<typeof environmentSchema>;

const result = environmentSchema.safeParse(process.env);

if (!result.success) {
    const details = result.error.issues
        .map((issue) => {
            const variable = issue.path.join('.') || 'configuração';
            return `- ${variable}: ${issue.message}`;
        })
        .join('\n');

    console.error(`\nConfiguração de ambiente inválida:\n${details}\n`);
    process.exit(1);
}

export const env: Environment = result.data;
