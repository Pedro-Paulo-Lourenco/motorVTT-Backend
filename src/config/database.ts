/** Cria o pool MySQL compartilhado e expõe seu ciclo de vida ao restante da aplicação. */
// Importações: reúnem bibliotecas, tipos e módulos locais usados pelos blocos seguintes.
import mysql, { type Pool, type PoolOptions } from 'mysql2/promise';

import { env } from './env.js';

const poolOptions: PoolOptions = {
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    database: env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    maxIdle: 10,
    idleTimeout: 60_000,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    ...(env.DB_PASS === undefined ? {} : { password: env.DB_PASS }),
};

const pool: Pool = mysql.createPool(poolOptions);

export default pool;
// Encerramento do módulo: reexporta ou torna públicas somente as interfaces escolhidas.
export { pool };

export async function checkDatabaseConnection(): Promise<void> {
// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
    await pool.query('SELECT 1');
}

export async function closeDatabase(): Promise<void> {
    await pool.end();
}
