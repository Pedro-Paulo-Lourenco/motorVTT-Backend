/** Define o contrato mínimo compartilhado por cada migração de banco. */
// Dependências deste módulo: cada importação fornece recursos, tipos ou integrações usados na implementação abaixo.
import type { PoolConnection } from 'mysql2/promise';

// API pública do módulo: `Migration` define a interface pública consumida pelos demais módulos.
export interface Migration {
    name: string;
    up(connection: PoolConnection): Promise<void>;
    down(connection: PoolConnection): Promise<void>;
}
