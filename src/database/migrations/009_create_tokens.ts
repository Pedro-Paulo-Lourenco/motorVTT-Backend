import type { Migration } from './types.js';

const migration: Migration = {
    name: '009_create_tokens',
    async up(connection) {
        await connection.query(`
            CREATE TABLE tokens (
                id CHAR(36) NOT NULL,
                cena_id CHAR(36) NOT NULL,
                asset_origem_id CHAR(36) NULL,
                character_sheet_id CHAR(36) NULL,
                nome VARCHAR(120) NOT NULL,
                x DOUBLE NOT NULL,
                y DOUBLE NOT NULL,
                escala DOUBLE NOT NULL,
                status_bar_map JSON NULL,
                custom_data JSON NULL,
                PRIMARY KEY (id),
                KEY idx_tokens_scene (cena_id),
                KEY idx_tokens_asset (asset_origem_id),
                KEY idx_tokens_character_sheet (character_sheet_id),
                CONSTRAINT fk_tokens_scene FOREIGN KEY (cena_id) REFERENCES scenes (id)
                    ON DELETE CASCADE ON UPDATE CASCADE,
                CONSTRAINT fk_tokens_asset FOREIGN KEY (asset_origem_id) REFERENCES assets (id)
                    ON DELETE SET NULL ON UPDATE CASCADE,
                CONSTRAINT fk_tokens_character_sheet FOREIGN KEY (character_sheet_id) REFERENCES character_sheets (id)
                    ON DELETE SET NULL ON UPDATE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
    },
    async down(connection) { await connection.query('DROP TABLE tokens'); },
};

export default migration;
