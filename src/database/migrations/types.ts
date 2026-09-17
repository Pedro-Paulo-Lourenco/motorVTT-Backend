import type { PoolConnection } from 'mysql2/promise';

export interface Migration {
    name: string;
    up(connection: PoolConnection): Promise<void>;
    down(connection: PoolConnection): Promise<void>;
}
