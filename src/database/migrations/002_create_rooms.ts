import type { Migration } from './types.js';

const migration: Migration = {
    name: '002_create_rooms',
    async up(connection) {
        await connection.query(`
            CREATE TABLE rooms (
                id CHAR(36) NOT NULL,
                nome VARCHAR(120) NOT NULL,
                codigo_convite VARCHAR(64) NOT NULL,
                criador_id CHAR(36) NOT NULL,
                status ENUM('ATIVA', 'PAUSADA', 'ENCERRADA') NOT NULL DEFAULT 'ATIVA',
                created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
                updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
                PRIMARY KEY (id),
                UNIQUE KEY uq_rooms_invite_code (codigo_convite),
                KEY idx_rooms_creator (criador_id),
                KEY idx_rooms_status (status),
                CONSTRAINT fk_rooms_creator FOREIGN KEY (criador_id) REFERENCES users (id)
                    ON DELETE RESTRICT ON UPDATE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
    },
    async down(connection) { await connection.query('DROP TABLE rooms'); },
};

export default migration;
