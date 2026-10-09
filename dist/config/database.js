import mysql, {} from 'mysql2/promise';
import { env } from './env.js';
const poolOptions = {
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
const pool = mysql.createPool(poolOptions);
export default pool;
export { pool };
export async function checkDatabaseConnection() {
    await pool.query('SELECT 1');
}
export async function closeDatabase() {
    await pool.end();
}
//# sourceMappingURL=database.js.map