import { z } from 'zod';
declare const environmentSchema: z.ZodObject<{
    NODE_ENV: z.ZodDefault<z.ZodEnum<{
        development: "development";
        production: "production";
        test: "test";
    }>>;
    PORT: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    APP_URL: z.ZodDefault<z.ZodString>;
    CORS_ORIGIN: z.ZodDefault<z.ZodString>;
    DATABASE_URL: z.ZodPreprocess<z.ZodOptional<z.ZodString>, unknown>;
    DB_HOST: z.ZodDefault<z.ZodString>;
    DB_PORT: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    DB_USER: z.ZodDefault<z.ZodString>;
    DB_PASS: z.ZodOptional<z.ZodString>;
    DB_NAME: z.ZodDefault<z.ZodString>;
    JWT_SECRET: z.ZodPreprocess<z.ZodString, unknown>;
    JWT_EXPIRES_IN: z.ZodDefault<z.ZodString>;
    COOKIE_SECRET: z.ZodPreprocess<z.ZodOptional<z.ZodString>, unknown>;
    REFRESH_TOKEN_EXPIRES_IN: z.ZodDefault<z.ZodString>;
    SMTP_HOST: z.ZodOptional<z.ZodString>;
    SMTP_PORT: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    SMTP_USER: z.ZodOptional<z.ZodString>;
    SMTP_PASS: z.ZodOptional<z.ZodString>;
    EMAIL_FROM: z.ZodOptional<z.ZodString>;
    REDIS_URL: z.ZodOptional<z.ZodString>;
    STORAGE_DRIVER: z.ZodDefault<z.ZodEnum<{
        local: "local";
        s3: "s3";
    }>>;
    STORAGE_PATH: z.ZodDefault<z.ZodString>;
    TABLETOP_BACKGROUND_URL: z.ZodPreprocess<z.ZodOptional<z.ZodString>, unknown>;
    TABLETOP_GRID_SIZE: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    S3_BUCKET: z.ZodPreprocess<z.ZodOptional<z.ZodString>, unknown>;
    S3_REGION: z.ZodPreprocess<z.ZodOptional<z.ZodString>, unknown>;
    S3_ENDPOINT: z.ZodPreprocess<z.ZodOptional<z.ZodString>, unknown>;
    S3_ACCESS_KEY_ID: z.ZodPreprocess<z.ZodOptional<z.ZodString>, unknown>;
    S3_SECRET_ACCESS_KEY: z.ZodPreprocess<z.ZodOptional<z.ZodString>, unknown>;
}, z.core.$strip>;
export type Environment = z.infer<typeof environmentSchema>;
export declare const env: Environment;
export {};
//# sourceMappingURL=env.d.ts.map