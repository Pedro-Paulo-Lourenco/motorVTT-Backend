/** Cria os tabuleiros associados às salas. */
// Dependências deste módulo: cada importação fornece recursos, tipos ou integrações usados na implementação abaixo.
import type { Migration } from './types.js';

const migration: Migration = {
    name: '003_create_boards',
    async up(connection) {
// Persistência: esta consulta lê ou altera os registros necessários para manter o estado da aplicação consistente.
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
// Persistência: esta consulta lê ou altera os registros necessários para manter o estado da aplicação consistente.
    async down(connection) { await connection.query('DROP TABLE boards'); },
};

export default migration;
