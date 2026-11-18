/** Vincula o tabuleiro à cena ativa e define sua integridade referencial. */
// Importações: reúnem bibliotecas, tipos e módulos locais usados pelos blocos seguintes.
import type { Migration } from './types.js';

const migration: Migration = {
    name: '011_add_board_active_scene_fk',
    async up(connection) {
// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
        await connection.query(`
            ALTER TABLE boards
            ADD CONSTRAINT fk_boards_active_scene FOREIGN KEY (cena_ativa_id) REFERENCES scenes (id)
                ON DELETE SET NULL ON UPDATE CASCADE
        `);
    },
    async down(connection) {
// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
        await connection.query('ALTER TABLE boards DROP FOREIGN KEY fk_boards_active_scene');
    },
};

export default migration;
