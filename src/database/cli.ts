/** Executa criação, aplicação e reversão das migrações MySQL com lock. */
// Importações: reúnem bibliotecas, tipos e módulos locais usados pelos blocos seguintes.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RowDataPacket } from 'mysql2/promise';

import { closeDatabase, pool } from '../config/database.js';
import { loadMigrations } from './migrations/index.js';

// Tipo: `MigrationRow` descreve o formato estruturado usado nas operações relacionadas.
interface MigrationRow extends RowDataPacket {
    id: number;
    name: string;
    batch: number;
}

// Constante ou estado local: `lockName` mantém o dado necessário ao fluxo abaixo.
const lockName = 'motor_vtt_schema_migrations';

// Bloco local: `ensureMigrationsTable` concentra uma responsabilidade reutilizada dentro deste módulo.
async function ensureMigrationsTable(): Promise<void> {
// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
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

// Bloco local: `acquireLock` concentra uma responsabilidade reutilizada dentro deste módulo.
async function acquireLock(): Promise<void> {
// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
    const [rows] = await pool.query<RowDataPacket[]>('SELECT GET_LOCK(?, 30) AS acquired', [lockName]);
// Constante ou estado local: `acquired` mantém o dado necessário ao fluxo abaixo.
    const acquired = Number((rows[0] as RowDataPacket & { acquired: number } | undefined)?.acquired);
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
    if (acquired !== 1) throw new Error('Não foi possível obter o lock para executar migrations.');
}

// Bloco local: `releaseLock` concentra uma responsabilidade reutilizada dentro deste módulo.
async function releaseLock(): Promise<void> {
// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
    await pool.query('SELECT RELEASE_LOCK(?)', [lockName]);
}

// Bloco local: `appliedMigrations` concentra uma responsabilidade reutilizada dentro deste módulo.
async function appliedMigrations(): Promise<MigrationRow[]> {
// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
    const [rows] = await pool.query<MigrationRow[]>(
        'SELECT id, name, batch FROM schema_migrations ORDER BY id ASC',
    );
    return rows;
}

// Bloco local: `migrateUp` concentra uma responsabilidade reutilizada dentro deste módulo.
async function migrateUp(): Promise<void> {
    await ensureMigrationsTable();
    await acquireLock();
// Bloco protegido: mantém o fluxo principal e suas finalizações ou tratamentos associados.
    try {
// Constante ou estado local: `migrations` mantém o dado necessário ao fluxo abaixo.
        const migrations = await loadMigrations();
// Constante ou estado local: `applied` mantém o dado necessário ao fluxo abaixo.
        const applied = new Set((await appliedMigrations()).map((migration) => migration.name));
// Constante ou estado local: `pending` mantém o dado necessário ao fluxo abaixo.
        const pending = migrations.filter((migration) => !applied.has(migration.name));
// Constante ou estado local: `batchRows` mantém o dado necessário ao fluxo abaixo.
// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
        const batchRows = await pool.query<RowDataPacket[]>('SELECT COALESCE(MAX(batch), 0) AS batch FROM schema_migrations');
// Constante ou estado local: `batch` mantém o dado necessário ao fluxo abaixo.
        const batch = Number((batchRows[0][0] as RowDataPacket & { batch: number }).batch) + 1;

// Iteração: processa repetidamente os elementos ou tentativas deste bloco.
        for (const migration of pending) {
// Constante ou estado local: `connection` mantém o dado necessário ao fluxo abaixo.
            const connection = await pool.getConnection();
// Bloco protegido: mantém o fluxo principal e suas finalizações ou tratamentos associados.
            try {
                await migration.up(connection);
// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
                await connection.query('INSERT INTO schema_migrations (name, batch) VALUES (?, ?)', [migration.name, batch]);
                console.log(`Aplicada: ${migration.name}`);
            } finally {
                connection.release();
            }
        }
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
        if (pending.length === 0) console.log('Nenhuma migration pendente.');
    } finally {
        await releaseLock();
    }
}

// Bloco local: `migrateDown` concentra uma responsabilidade reutilizada dentro deste módulo.
async function migrateDown(): Promise<void> {
    await ensureMigrationsTable();
    await acquireLock();
// Bloco protegido: mantém o fluxo principal e suas finalizações ou tratamentos associados.
    try {
// Constante ou estado local: `migrations` mantém o dado necessário ao fluxo abaixo.
        const migrations = await loadMigrations();
// Constante ou estado local: `applied` mantém o dado necessário ao fluxo abaixo.
        const applied = await appliedMigrations();
// Constante ou estado local: `last` mantém o dado necessário ao fluxo abaixo.
        const last = applied.at(-1);
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
        if (!last) {
            console.log('Nenhuma migration aplicada.');
            return;
        }
// Constante ou estado local: `migration` mantém o dado necessário ao fluxo abaixo.
        const migration = migrations.find((candidate) => candidate.name === last.name);
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
        if (!migration) throw new Error(`Migration aplicada não encontrada no código: ${last.name}`);

// Constante ou estado local: `connection` mantém o dado necessário ao fluxo abaixo.
        const connection = await pool.getConnection();
// Bloco protegido: mantém o fluxo principal e suas finalizações ou tratamentos associados.
        try {
            await migration.down(connection);
// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
            await connection.query('DELETE FROM schema_migrations WHERE id = ?', [last.id]);
            console.log(`Revertida: ${migration.name}`);
        } finally {
            connection.release();
        }
    } finally {
        await releaseLock();
    }
}

// Bloco local: `makeMigration` concentra uma responsabilidade reutilizada dentro deste módulo.
async function makeMigration(name: string): Promise<void> {
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
    if (!name || !/^[a-z0-9_]+$/.test(name)) {
        throw new Error('Informe um nome em snake_case contendo apenas letras minúsculas, números e _.');
    }
// Constante ou estado local: `migrationDirectory` mantém o dado necessário ao fluxo abaixo.
    const migrationDirectory = fileURLToPath(new URL('./migrations/', import.meta.url));
// Constante ou estado local: `fileName` mantém o dado necessário ao fluxo abaixo.
    const fileName = `${Date.now()}_${name}.ts`;
    await mkdir(migrationDirectory, { recursive: true });
    await writeFile(join(migrationDirectory, fileName), `import type { Migration } from './types.js';\n\nconst migration: Migration = {\n    name: '${fileName.replace('.ts', '')}',\n    async up() {\n        // Implemente a alteração do schema aqui.\n    },\n    async down() {\n        // Desfaça rigorosamente a alteração acima aqui.\n    },\n};\n\nexport default migration;\n`, 'utf8');
    console.log(`Criada: ${join('src/database/migrations', fileName)}`);
}

// Bloco local: `main` concentra uma responsabilidade reutilizada dentro deste módulo.
async function main(): Promise<void> {
    const [command, name] = process.argv.slice(2);
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
    if (command === 'up') await migrateUp();
// Caminho alternativo: cobre o caso em que a condição anterior não foi atendida.
    else if (command === 'down' || command === 'rollback') await migrateDown();
// Caminho alternativo: cobre o caso em que a condição anterior não foi atendida.
    else if (command === 'make') await makeMigration(name ?? '');
    else throw new Error('Uso: npm run migrate:up | migrate:down | migrate:make -- nome_da_migration');
}

// Bloco protegido: mantém o fluxo principal e suas finalizações ou tratamentos associados.
try {
    await main();
} catch (error) {
    console.error('Falha nas migrations.', error);
    process.exitCode = 1;
} finally {
    await closeDatabase();
}
