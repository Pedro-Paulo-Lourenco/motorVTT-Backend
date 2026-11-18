/** Vincula o tabuleiro à cena ativa e define sua integridade referencial. */
// Dependências deste módulo: cada importação fornece recursos, tipos ou integrações usados na implementação abaixo.
import type { Migration } from './types.js';

const migration: Migration = {
    name: '011_add_board_active_scene_fk',
    async up(connection) {
// Persistência: esta consulta lê ou altera os registros necessários para manter o estado da aplicação consistente.
        await connection.query(`
            ALTER TABLE boards
            ADD CONSTRAINT fk_boards_active_scene FOREIGN KEY (cena_ativa_id) REFERENCES scenes (id)
                ON DELETE SET NULL ON UPDATE CASCADE
        `);
    },
    async down(connection) {
// Persistência: esta consulta lê ou altera os registros necessários para manter o estado da aplicação consistente.
        await connection.query('ALTER TABLE boards DROP FOREIGN KEY fk_boards_active_scene');
    },
};

export default migration;
