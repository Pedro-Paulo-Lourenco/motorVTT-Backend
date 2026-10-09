import { type Pool } from 'mysql2/promise';
declare const pool: Pool;
export default pool;
export { pool };
export declare function checkDatabaseConnection(): Promise<void>;
export declare function closeDatabase(): Promise<void>;
//# sourceMappingURL=database.d.ts.map