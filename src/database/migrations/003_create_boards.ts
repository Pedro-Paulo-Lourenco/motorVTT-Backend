import type { Migration } from './types.js';

const migration: Migration = {
    name: '003_create_boards',
    async up(connection) {
        await connection.query(`
            CREATE TABLE boards (
                id CHAR(36) NOT NULL,
                sala_id CHAR(36) NOT NULL,
                nome VARCHAR(120) NOT NULL,
                cena_ativa_id CHAR(36) NULL,
                created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
                updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
                PRIMARY KEY (id),
                KEY idx_boards_room (sala_id),
                KEY idx_boards_active_scene (cena_ativa_id),
                CONSTRAINT fk_boards_room FOREIGN KEY (sala_id) REFERENCES rooms (id)
                    ON DELETE CASCADE ON UPDATE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
    },
    async down(connection) { await connection.query('DROP TABLE boards'); },
};

export default migration;
