import type { Migration } from './types.js';

const migration: Migration = {
    name: '014_make_sheet_ownership_required',
    async up(connection) {
        await connection.query('ALTER TABLE sheet_templates MODIFY sala_id CHAR(36) NULL');
        await connection.query('ALTER TABLE character_sheets MODIFY sala_id CHAR(36) NULL');
        await connection.query(`
            UPDATE sheet_templates st
            INNER JOIN (
                SELECT sala_id, MIN(usuario_id) AS usuario_id
                FROM participants
                WHERE sala_id IS NOT NULL
                GROUP BY sala_id
            ) owner ON owner.sala_id = st.sala_id
            SET st.usuario_id = owner.usuario_id
            WHERE st.usuario_id IS NULL
        `);
        await connection.query('DELETE FROM sheet_templates WHERE usuario_id IS NULL');
        await connection.query('ALTER TABLE sheet_templates DROP FOREIGN KEY fk_sheet_templates_user');
        await connection.query('ALTER TABLE sheet_templates MODIFY usuario_id CHAR(36) NOT NULL');
        await connection.query(`
            ALTER TABLE sheet_templates
                ADD CONSTRAINT fk_sheet_templates_user FOREIGN KEY (usuario_id) REFERENCES users (id)
                    ON DELETE CASCADE ON UPDATE CASCADE
        `);
    },
    async down(connection) {
        await connection.query('ALTER TABLE sheet_templates DROP FOREIGN KEY fk_sheet_templates_user');
        await connection.query('ALTER TABLE sheet_templates MODIFY usuario_id CHAR(36) NULL');
        await connection.query(`
            ALTER TABLE sheet_templates
                ADD CONSTRAINT fk_sheet_templates_user FOREIGN KEY (usuario_id) REFERENCES users (id)
                    ON DELETE SET NULL ON UPDATE CASCADE
        `);
    },
};

export default migration;
