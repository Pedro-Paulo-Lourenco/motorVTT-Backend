import type { Migration } from './types.js';

const migration: Migration = {
    name: '011_add_board_active_scene_fk',
    async up(connection) {
        await connection.query(`
            ALTER TABLE boards
            ADD CONSTRAINT fk_boards_active_scene FOREIGN KEY (cena_ativa_id) REFERENCES scenes (id)
                ON DELETE SET NULL ON UPDATE CASCADE
        `);
    },
    async down(connection) {
        await connection.query('ALTER TABLE boards DROP FOREIGN KEY fk_boards_active_scene');
    },
};

export default migration;
