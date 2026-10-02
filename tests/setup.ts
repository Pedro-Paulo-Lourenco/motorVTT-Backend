import { existsSync } from 'node:fs';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= 'test-only-jwt-secret-with-at-least-thirty-two-characters';
process.env.DB_NAME ??= 'motor_vtt_test';
process.env.APP_URL ??= 'http://localhost:3000';
process.env.CORS_ORIGIN ??= 'http://localhost:5173';

if (process.env.DOTENV_CONFIG_PATH === undefined) {
    process.env.DOTENV_CONFIG_PATH = existsSync('.env.test')
        ? '.env.test'
        : existsSync('.env.development')
            ? '.env.development'
            : '.env.test';
}
