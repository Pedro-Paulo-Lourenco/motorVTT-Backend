import type { Migration } from './types.js';

const migration: Migration = {
    name: '001_create_users',
    async up(connection) {
        await connection.query(`
            CREATE TABLE users (
                id CHAR(36) NOT NULL,
                nome VARCHAR(120) NOT NULL,
                email VARCHAR(255) NOT NULL,
                status ENUM('PENDENTE', 'ATIVO', 'BLOQUEADO') NOT NULL DEFAULT 'PENDENTE',
                ultimo_login DATETIME(3) NULL,
                created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
                updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
                PRIMARY KEY (id),
                UNIQUE KEY uq_users_email (email),
                KEY idx_users_status (status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
    },
    async down(connection) { await connection.query('DROP TABLE users'); },
};

export default migration;
