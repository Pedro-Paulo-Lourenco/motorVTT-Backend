/** Registra a participação e o papel dos usuários nas salas. */
// Dependências deste módulo: cada importação fornece recursos, tipos ou integrações usados na implementação abaixo.
import type { Migration } from './types.js';

const migration: Migration = {
    name: '004_create_participants',
    async up(connection) {
// Persistência: esta consulta lê ou altera os registros necessários para manter o estado da aplicação consistente.
        await connection.query(`
            CREATE TABLE participants (
                id CHAR(36) NOT NULL,
                sala_id CHAR(36) NOT NULL,
                usuario_id CHAR(36) NOT NULL,
                papel ENUM('MESTRE', 'JOGADOR') NOT NULL,
                ativo BOOLEAN NOT NULL DEFAULT TRUE,
                preferencias_view JSON NOT NULL,
                joined_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
                PRIMARY KEY (id),
                UNIQUE KEY uq_participants_room_user (sala_id, usuario_id),
                KEY idx_participants_user (usuario_id),
                KEY idx_participants_active (sala_id, ativo),
                CONSTRAINT fk_participants_room FOREIGN KEY (sala_id) REFERENCES rooms (id)
                    ON DELETE CASCADE ON UPDATE CASCADE,
                CONSTRAINT fk_participants_user FOREIGN KEY (usuario_id) REFERENCES users (id)
                    ON DELETE CASCADE ON UPDATE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
    },
// Persistência: esta consulta lê ou altera os registros necessários para manter o estado da aplicação consistente.
    async down(connection) { await connection.query('DROP TABLE participants'); },
};

export default migration;
