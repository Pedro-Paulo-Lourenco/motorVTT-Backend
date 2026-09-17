import type { Migration } from './types.js';

const migration: Migration = {
    name: '008_create_character_sheets',
    async up(connection) {
        await connection.query(`
            CREATE TABLE character_sheets (
                id CHAR(36) NOT NULL,
                template_id CHAR(36) NOT NULL,
                usuario_id CHAR(36) NOT NULL,
                sala_id CHAR(36) NULL,
                nome VARCHAR(160) NOT NULL,
                dados_preenchidos JSON NOT NULL,
                versao INT UNSIGNED NOT NULL DEFAULT 0,
                created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
                updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
                PRIMARY KEY (id),
                KEY idx_character_sheets_template (template_id),
                KEY idx_character_sheets_user (usuario_id),
                KEY idx_character_sheets_room (sala_id),
                CONSTRAINT fk_character_sheets_template FOREIGN KEY (template_id) REFERENCES sheet_templates (id)
                    ON DELETE RESTRICT ON UPDATE CASCADE,
                CONSTRAINT fk_character_sheets_user FOREIGN KEY (usuario_id) REFERENCES users (id)
                    ON DELETE CASCADE ON UPDATE CASCADE,
                CONSTRAINT fk_character_sheets_room FOREIGN KEY (sala_id) REFERENCES rooms (id)
                    ON DELETE SET NULL ON UPDATE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
    },
    async down(connection) { await connection.query('DROP TABLE character_sheets'); },
};

export default migration;
