import type { Migration } from './types.js';

const migration: Migration = {
    name: '006_create_sheet_templates',
    async up(connection) {
        await connection.query(`
            CREATE TABLE sheet_templates (
                id CHAR(36) NOT NULL,
                usuario_id CHAR(36) NULL,
                sala_id CHAR(36) NULL,
                nome VARCHAR(160) NOT NULL,
                sistema VARCHAR(80) NULL,
                campos_schema JSON NOT NULL,
                created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
                updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
                PRIMARY KEY (id),
                KEY idx_sheet_templates_user (usuario_id),
                KEY idx_sheet_templates_room (sala_id),
                CONSTRAINT fk_sheet_templates_user FOREIGN KEY (usuario_id) REFERENCES users (id)
                    ON DELETE SET NULL ON UPDATE CASCADE,
                CONSTRAINT fk_sheet_templates_room FOREIGN KEY (sala_id) REFERENCES rooms (id)
                    ON DELETE SET NULL ON UPDATE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
    },
    async down(connection) { await connection.query('DROP TABLE sheet_templates'); },
};

export default migration;
