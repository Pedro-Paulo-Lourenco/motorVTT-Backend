import type { Migration } from './types.js';

const migration: Migration = {
    name: '010_create_message_logs',
    async up(connection) {
        await connection.query(`
            CREATE TABLE message_logs (
                id CHAR(36) NOT NULL,
                sala_id CHAR(36) NOT NULL,
                autor_id CHAR(36) NOT NULL,
                tipo ENUM('CHAT', 'ROLAGEM', 'SISTEMA') NOT NULL,
                conteudo VARCHAR(4000) NOT NULL,
                secreto BOOLEAN NOT NULL DEFAULT FALSE,
                metadata JSON NULL,
                created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
                PRIMARY KEY (id),
                KEY idx_message_logs_room_created (sala_id, created_at),
                KEY idx_message_logs_author (autor_id),
                CONSTRAINT fk_message_logs_room FOREIGN KEY (sala_id) REFERENCES rooms (id)
                    ON DELETE CASCADE ON UPDATE CASCADE,
                CONSTRAINT fk_message_logs_author FOREIGN KEY (autor_id) REFERENCES users (id)
                    ON DELETE RESTRICT ON UPDATE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
    },
    async down(connection) { await connection.query('DROP TABLE message_logs'); },
};

export default migration;
