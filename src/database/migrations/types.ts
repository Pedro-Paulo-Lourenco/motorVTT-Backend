/** Define o contrato mínimo compartilhado por cada migração de banco. */
// Importações: reúnem bibliotecas, tipos e módulos locais usados pelos blocos seguintes.
import type { PoolConnection } from 'mysql2/promise';

// Exportação principal: `Migration` disponibiliza esta responsabilidade para os consumidores deste módulo.
export interface Migration {
    name: string;
    up(connection: PoolConnection): Promise<void>;
    down(connection: PoolConnection): Promise<void>;
}
