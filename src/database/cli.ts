import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RowDataPacket } from 'mysql2/promise';

import { closeDatabase, pool } from '../config/database.js';
import { loadMigrations } from './migrations/index.js';

interface MigrationRow extends RowDataPacket {
    id: number;
    name: string;
    batch: number;
}

const lockName = 'motor_vtt_schema_migrations';

async function ensureMigrationsTable(): Promise<void> {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT,
            name VARCHAR(255) NOT NULL,
            batch INT UNSIGNED NOT NULL,
            applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            PRIMARY KEY (id),
            UNIQUE KEY uq_schema_migrations_name (name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
}

async function acquireLock(): Promise<void> {
    const [rows] = await pool.query<RowDataPacket[]>('SELECT GET_LOCK(?, 30) AS acquired', [lockName]);
    const acquired = Number((rows[0] as RowDataPacket & { acquired: number } | undefined)?.acquired);
    if (acquired !== 1) throw new Error('Não foi possível obter o lock para executar migrations.');
}

async function releaseLock(): Promise<void> {
    await pool.query('SELECT RELEASE_LOCK(?)', [lockName]);
}

async function appliedMigrations(): Promise<MigrationRow[]> {
    const [rows] = await pool.query<MigrationRow[]>(
        'SELECT id, name, batch FROM schema_migrations ORDER BY id ASC',
    );
    return rows;
}

async function migrateUp(): Promise<void> {
    await ensureMigrationsTable();
    await acquireLock();
    try {
        const migrations = await loadMigrations();
        const applied = new Set((await appliedMigrations()).map((migration) => migration.name));
        const pending = migrations.filter((migration) => !applied.has(migration.name));
        const batchRows = await pool.query<RowDataPacket[]>('SELECT COALESCE(MAX(batch), 0) AS batch FROM schema_migrations');
        const batch = Number((batchRows[0][0] as RowDataPacket & { batch: number }).batch) + 1;

        for (const migration of pending) {
            const connection = await pool.getConnection();
            try {
                await migration.up(connection);
                await connection.query('INSERT INTO schema_migrations (name, batch) VALUES (?, ?)', [migration.name, batch]);
                console.log(`Aplicada: ${migration.name}`);
            } finally {
                connection.release();
            }
        }
        if (pending.length === 0) console.log('Nenhuma migration pendente.');
    } finally {
        await releaseLock();
    }
}

async function migrateDown(): Promise<void> {
    await ensureMigrationsTable();
    await acquireLock();
    try {
        const migrations = await loadMigrations();
        const applied = await appliedMigrations();
        const last = applied.at(-1);
        if (!last) {
            console.log('Nenhuma migration aplicada.');
            return;
        }
        const migration = migrations.find((candidate) => candidate.name === last.name);
        if (!migration) throw new Error(`Migration aplicada não encontrada no código: ${last.name}`);

        const connection = await pool.getConnection();
        try {
            await migration.down(connection);
            await connection.query('DELETE FROM schema_migrations WHERE id = ?', [last.id]);
            console.log(`Revertida: ${migration.name}`);
        } finally {
            connection.release();
        }
    } finally {
        await releaseLock();
    }
}

async function makeMigration(name: string): Promise<void> {
    if (!name || !/^[a-z0-9_]+$/.test(name)) {
        throw new Error('Informe um nome em snake_case contendo apenas letras minúsculas, números e _.');
    }
    const migrationDirectory = fileURLToPath(new URL('./migrations/', import.meta.url));
    const fileName = `${Date.now()}_${name}.ts`;
    await mkdir(migrationDirectory, { recursive: true });
    await writeFile(join(migrationDirectory, fileName), `import type { Migration } from './types.js';\n\nconst migration: Migration = {\n    name: '${fileName.replace('.ts', '')}',\n    async up() {\n        // Implemente a alteração do schema aqui.\n    },\n    async down() {\n        // Desfaça rigorosamente a alteração acima aqui.\n    },\n};\n\nexport default migration;\n`, 'utf8');
    console.log(`Criada: ${join('src/database/migrations', fileName)}`);
}

async function main(): Promise<void> {
    const [command, name] = process.argv.slice(2);
    if (command === 'up') await migrateUp();
    else if (command === 'down' || command === 'rollback') await migrateDown();
    else if (command === 'make') await makeMigration(name ?? '');
    else throw new Error('Uso: npm run migrate:up | migrate:down | migrate:make -- nome_da_migration');
}

try {
    await main();
} catch (error) {
    console.error('Falha nas migrations.', error);
    process.exitCode = 1;
} finally {
    await closeDatabase();
}
