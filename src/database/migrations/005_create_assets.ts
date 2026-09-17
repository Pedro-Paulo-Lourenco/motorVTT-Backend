import type { Migration } from './types.js';

const migration: Migration = {
    name: '005_create_assets',
    async up(connection) {
        await connection.query(`
            CREATE TABLE assets (
                id CHAR(36) NOT NULL,
                usuario_id CHAR(36) NULL,
                sala_id CHAR(36) NULL,
                nome VARCHAR(160) NOT NULL,
                tipo ENUM('TEMPLATE_FICHA', 'NPC_PRESET', 'MAPA', 'TOKEN') NOT NULL,
                url VARCHAR(2048) NOT NULL,
                pasta_id CHAR(36) NULL,
                visibilidade ENUM('PRIVADO', 'SALA', 'ATRIBUIDO', 'GLOBAL') NOT NULL,
                metadata JSON NULL,
                created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
                updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
                PRIMARY KEY (id),
                KEY idx_assets_user (usuario_id),
                KEY idx_assets_room (sala_id),
                KEY idx_assets_folder (pasta_id),
                KEY idx_assets_type_visibility (tipo, visibilidade),
                CONSTRAINT fk_assets_user FOREIGN KEY (usuario_id) REFERENCES users (id)
                    ON DELETE SET NULL ON UPDATE CASCADE,
                CONSTRAINT fk_assets_room FOREIGN KEY (sala_id) REFERENCES rooms (id)
                    ON DELETE SET NULL ON UPDATE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
    },
    async down(connection) { await connection.query('DROP TABLE assets'); },
};

export default migration;
