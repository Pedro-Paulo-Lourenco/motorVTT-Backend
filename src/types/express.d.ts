/** Amplia os tipos do Express com o usuário autenticado da requisição. */
// Importações: reúnem bibliotecas, tipos e módulos locais usados pelos blocos seguintes.
import type { AuthenticatedRequestUser } from '../http/types.js';

declare global {
    namespace Express {
// Tipo: `Request` descreve o formato estruturado usado nas operações relacionadas.
        interface Request {
            user?: AuthenticatedRequestUser;
        }
    }
}

// Encerramento do módulo: reexporta ou torna públicas somente as interfaces escolhidas.
export {};
