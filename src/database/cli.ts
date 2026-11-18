/** Executa criação, aplicação e reversão das migrações MySQL com lock. */
// Dependências deste módulo: cada importação fornece recursos, tipos ou integrações usados na implementação abaixo.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RowDataPacket } from 'mysql2/promise';

import { closeDatabase, pool } from '../config/database.js';
import { loadMigrations } from './migrations/index.js';

// Contrato de dados: `MigrationRow` documenta o formato e o significado dos dados trocados entre as camadas relacionadas.
interface MigrationRow extends RowDataPacket {
    id: number;
    name: string;
    batch: number;
}

// Estado intermediário: `lockName` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
const lockName = 'motor_vtt_schema_migrations';

// Função auxiliar: `ensureMigrationsTable` isola uma responsabilidade reutilizada neste módulo.
async function ensureMigrationsTable(): Promise<void> {
// Persistência: esta consulta lê ou altera os registros necessários para manter o estado da aplicação consistente.
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

// Função auxiliar: `acquireLock` isola uma responsabilidade reutilizada neste módulo.
async function acquireLock(): Promise<void> {
// Persistência: esta consulta lê ou altera os registros necessários para manter o estado da aplicação consistente.
    const [rows] = await pool.query<RowDataPacket[]>('SELECT GET_LOCK(?, 30) AS acquired', [lockName]);
// Estado intermediário: `acquired` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const acquired = Number((rows[0] as RowDataPacket & { acquired: number } | undefined)?.acquired);
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
    if (acquired !== 1) throw new Error('Não foi possível obter o lock para executar migrations.');
}

// Função auxiliar: `releaseLock` isola uma responsabilidade reutilizada neste módulo.
async function releaseLock(): Promise<void> {
// Persistência: esta consulta lê ou altera os registros necessários para manter o estado da aplicação consistente.
    await pool.query('SELECT RELEASE_LOCK(?)', [lockName]);
}

// Função auxiliar: `appliedMigrations` isola uma responsabilidade reutilizada neste módulo.
async function appliedMigrations(): Promise<MigrationRow[]> {
// Persistência: esta consulta lê ou altera os registros necessários para manter o estado da aplicação consistente.
    const [rows] = await pool.query<MigrationRow[]>(
        'SELECT id, name, batch FROM schema_migrations ORDER BY id ASC',
    );
    return rows;
}

// Função auxiliar: `migrateUp` isola uma responsabilidade reutilizada neste módulo.
async function migrateUp(): Promise<void> {
    await ensureMigrationsTable();
    await acquireLock();
// Tratamento protegido: garante que o recurso seja finalizado e que erros sigam para o fluxo central de tratamento.
    try {
// Estado intermediário: `migrations` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
        const migrations = await loadMigrations();
// Estado intermediário: `applied` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
        const applied = new Set((await appliedMigrations()).map((migration) => migration.name));
// Estado intermediário: `pending` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
        const pending = migrations.filter((migration) => !applied.has(migration.name));
// Estado intermediário: `batchRows` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
// Persistência: esta consulta lê ou altera os registros necessários para manter o estado da aplicação consistente.
        const batchRows = await pool.query<RowDataPacket[]>('SELECT COALESCE(MAX(batch), 0) AS batch FROM schema_migrations');
// Estado intermediário: `batch` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
        const batch = Number((batchRows[0][0] as RowDataPacket & { batch: number }).batch) + 1;

// Iteração: percorre todos os elementos para aplicar a mesma regra a cada item.
        for (const migration of pending) {
// Estado intermediário: `connection` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
            const connection = await pool.getConnection();
// Tratamento protegido: garante que o recurso seja finalizado e que erros sigam para o fluxo central de tratamento.
            try {
                await migration.up(connection);
// Persistência: esta consulta lê ou altera os registros necessários para manter o estado da aplicação consistente.
                await connection.query('INSERT INTO schema_migrations (name, batch) VALUES (?, ?)', [migration.name, batch]);
                console.log(`Aplicada: ${migration.name}`);
            } finally {
                connection.release();
            }
        }
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
        if (pending.length === 0) console.log('Nenhuma migration pendente.');
    } finally {
        await releaseLock();
    }
}

// Função auxiliar: `migrateDown` isola uma responsabilidade reutilizada neste módulo.
async function migrateDown(): Promise<void> {
    await ensureMigrationsTable();
    await acquireLock();
// Tratamento protegido: garante que o recurso seja finalizado e que erros sigam para o fluxo central de tratamento.
    try {
// Estado intermediário: `migrations` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
        const migrations = await loadMigrations();
// Estado intermediário: `applied` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
        const applied = await appliedMigrations();
// Estado intermediário: `last` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
        const last = applied.at(-1);
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
        if (!last) {
            console.log('Nenhuma migration aplicada.');
            return;
        }
// Estado intermediário: `migration` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
        const migration = migrations.find((candidate) => candidate.name === last.name);
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
        if (!migration) throw new Error(`Migration aplicada não encontrada no código: ${last.name}`);

// Estado intermediário: `connection` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
        const connection = await pool.getConnection();
// Tratamento protegido: garante que o recurso seja finalizado e que erros sigam para o fluxo central de tratamento.
        try {
            await migration.down(connection);
// Persistência: esta consulta lê ou altera os registros necessários para manter o estado da aplicação consistente.
            await connection.query('DELETE FROM schema_migrations WHERE id = ?', [last.id]);
            console.log(`Revertida: ${migration.name}`);
        } finally {
            connection.release();
        }
    } finally {
        await releaseLock();
    }
}

// Função auxiliar: `makeMigration` isola uma responsabilidade reutilizada neste módulo.
async function makeMigration(name: string): Promise<void> {
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
    if (!name || !/^[a-z0-9_]+$/.test(name)) {
        throw new Error('Informe um nome em snake_case contendo apenas letras minúsculas, números e _.');
    }
// Estado intermediário: `migrationDirectory` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const migrationDirectory = fileURLToPath(new URL('./migrations/', import.meta.url));
// Estado intermediário: `fileName` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const fileName = `${Date.now()}_${name}.ts`;
    await mkdir(migrationDirectory, { recursive: true });
    await writeFile(join(migrationDirectory, fileName), `import type { Migration } from './types.js';\n\nconst migration: Migration = {\n    name: '${fileName.replace('.ts', '')}',\n    async up() {\n        // Implemente a alteração do schema aqui.\n    },\n    async down() {\n        // Desfaça rigorosamente a alteração acima aqui.\n    },\n};\n\nexport default migration;\n`, 'utf8');
    console.log(`Criada: ${join('src/database/migrations', fileName)}`);
}

// Função auxiliar: `main` isola uma responsabilidade reutilizada neste módulo.
async function main(): Promise<void> {
    const [command, name] = process.argv.slice(2);
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
    if (command === 'up') await migrateUp();
// Caminho alternativo: trata o cenário em que a condição principal não foi satisfeita.
    else if (command === 'down' || command === 'rollback') await migrateDown();
// Caminho alternativo: trata o cenário em que a condição principal não foi satisfeita.
    else if (command === 'make') await makeMigration(name ?? '');
    else throw new Error('Uso: npm run migrate:up | migrate:down | migrate:make -- nome_da_migration');
}

// Tratamento protegido: garante que o recurso seja finalizado e que erros sigam para o fluxo central de tratamento.
try {
    await main();
} catch (error) {
    console.error('Falha nas migrations.', error);
    process.exitCode = 1;
} finally {
    await closeDatabase();
}
