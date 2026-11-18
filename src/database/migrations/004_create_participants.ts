/** Registra a participação e o papel dos usuários nas salas. */
// Importações: reúnem bibliotecas, tipos e módulos locais usados pelos blocos seguintes.
import type { Migration } from './types.js';

const migration: Migration = {
    name: '004_create_participants',
    async up(connection) {
// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
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
// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
    async down(connection) { await connection.query('DROP TABLE participants'); },
};

export default migration;
