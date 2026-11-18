/** Cria cenas tabletop pertencentes aos tabuleiros. */
// Dependências deste módulo: cada importação fornece recursos, tipos ou integrações usados na implementação abaixo.
import type { Migration } from './types.js';

const migration: Migration = {
    name: '007_create_scenes',
    async up(connection) {
// Persistência: esta consulta lê ou altera os registros necessários para manter o estado da aplicação consistente.
        await connection.query(`
            CREATE TABLE scenes (
                id CHAR(36) NOT NULL,
                tabuleiro_id CHAR(36) NOT NULL,
                nome VARCHAR(120) NOT NULL,
                background_url VARCHAR(2048) NULL,
                grid_config JSON NOT NULL,
                visivel BOOLEAN NOT NULL DEFAULT TRUE,
                created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
                updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
                PRIMARY KEY (id),
                KEY idx_scenes_board (tabuleiro_id),
                CONSTRAINT fk_scenes_board FOREIGN KEY (tabuleiro_id) REFERENCES boards (id)
                    ON DELETE CASCADE ON UPDATE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
    },
// Persistência: esta consulta lê ou altera os registros necessários para manter o estado da aplicação consistente.
    async down(connection) { await connection.query('DROP TABLE scenes'); },
};

export default migration;
