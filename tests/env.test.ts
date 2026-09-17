import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';

import assert from 'node:assert/strict';

describe('configuração de ambiente', () => {
    it('aplica defaults locais e exporta valores tipados', async () => {
        const { env } = await import('../src/config/env.js');

        assert.equal(env.NODE_ENV, 'development');
        assert.equal(env.PORT, 3000);
        assert.equal(env.APP_URL, 'http://localhost:3000');
        assert.equal(env.CORS_ORIGIN, 'http://localhost:5173');
        assert.equal(env.DB_PORT, 3306);
        assert.equal(env.STORAGE_DRIVER, 'local');
    });

    it('encerra o processo e lista variáveis inválidas', () => {
        const result = spawnSync(
            process.execPath,
            ['--import', 'tsx', '-e', "import './src/config/env.ts'"],
            {
                cwd: process.cwd(),
                encoding: 'utf8',
                env: {
                    PATH: process.env.PATH,
                    NODE_ENV: 'invalid',
                    PORT: 'not-a-port',
                    APP_URL: 'not-a-url',
                    CORS_ORIGIN: 'not-a-url',
                },
            },
        );

        assert.equal(result.status, 1);
        const output = `${result.stdout}${result.stderr}`;
        assert.match(output, /NODE_ENV/);
        assert.match(output, /PORT/);
        assert.match(output, /APP_URL/);
        assert.match(output, /CORS_ORIGIN/);
    });
});
