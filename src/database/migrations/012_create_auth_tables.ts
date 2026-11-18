/** Cria credenciais e sessões necessárias à autenticação. */
// Dependências deste módulo: cada importação fornece recursos, tipos ou integrações usados na implementação abaixo.
import type { Migration } from './types.js';

const migration: Migration = {
    name: '012_create_auth_tables',
    async up(connection) {
// Persistência: esta consulta lê ou altera os registros necessários para manter o estado da aplicação consistente.
        await connection.query(`
            CREATE TABLE user_credentials (
                user_id CHAR(36) NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
                updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
                PRIMARY KEY (user_id),
                CONSTRAINT fk_user_credentials_user FOREIGN KEY (user_id) REFERENCES users (id)
                    ON DELETE CASCADE ON UPDATE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

// Persistência: esta consulta lê ou altera os registros necessários para manter o estado da aplicação consistente.
        await connection.query(`
            CREATE TABLE auth_sessions (
                id CHAR(36) NOT NULL,
                user_id CHAR(36) NOT NULL,
                refresh_token_hash CHAR(64) NOT NULL,
                expires_at DATETIME(3) NOT NULL,
                revoked_at DATETIME(3) NULL,
                last_used_at DATETIME(3) NULL,
                created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
                PRIMARY KEY (id),
                UNIQUE KEY uq_auth_sessions_refresh_token_hash (refresh_token_hash),
                KEY idx_auth_sessions_user (user_id),
                KEY idx_auth_sessions_expiration (expires_at),
                CONSTRAINT fk_auth_sessions_user FOREIGN KEY (user_id) REFERENCES users (id)
                    ON DELETE CASCADE ON UPDATE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
    },
    async down(connection) {
// Persistência: esta consulta lê ou altera os registros necessários para manter o estado da aplicação consistente.
        await connection.query('DROP TABLE auth_sessions');
// Persistência: esta consulta lê ou altera os registros necessários para manter o estado da aplicação consistente.
        await connection.query('DROP TABLE user_credentials');
    },
};

export default migration;
