/** Amplia os tipos do Express com o usuário autenticado da requisição. */
// Dependências deste módulo: cada importação fornece recursos, tipos ou integrações usados na implementação abaixo.
import type { AuthenticatedRequestUser } from '../http/types.js';

declare global {
    namespace Express {
// Contrato de dados: `Request` documenta o formato e o significado dos dados trocados entre as camadas relacionadas.
        interface Request {
            user?: AuthenticatedRequestUser;
        }
    }
}

// Encerramento do módulo: mantém a API do módulo restrita às interfaces que precisam ser consumidas externamente.
export {};
