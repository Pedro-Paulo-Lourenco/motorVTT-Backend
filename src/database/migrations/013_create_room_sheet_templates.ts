import type { Migration } from './types.js';

const migration: Migration = {
    name: '013_create_room_sheet_templates',
    async up(connection) {
        await connection.query(`
            CREATE TABLE room_sheet_templates (
                sala_id CHAR(36) NOT NULL,
                template_id CHAR(36) NOT NULL,
                created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
                PRIMARY KEY (sala_id, template_id),
                KEY idx_room_sheet_templates_template (template_id),
                CONSTRAINT fk_room_sheet_templates_room FOREIGN KEY (sala_id) REFERENCES rooms (id)
                    ON DELETE CASCADE ON UPDATE CASCADE,
                CONSTRAINT fk_room_sheet_templates_template FOREIGN KEY (template_id) REFERENCES sheet_templates (id)
                    ON DELETE CASCADE ON UPDATE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        await connection.query(`
            INSERT IGNORE INTO room_sheet_templates (sala_id, template_id)
            SELECT sala_id, id FROM sheet_templates WHERE sala_id IS NOT NULL
        `);
    },
    async down(connection) {
        await connection.query('DROP TABLE room_sheet_templates');
    },
};

export default migration;
