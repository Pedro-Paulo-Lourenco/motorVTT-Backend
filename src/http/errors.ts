/** Declara o erro HTTP conhecido, preservando status e código para o handler. */
// Exportação principal: `HttpError` disponibiliza esta responsabilidade para os consumidores deste módulo.
export class HttpError extends Error {
    public readonly statusCode: number;
    public readonly code: string;
    public readonly details?: Record<string, unknown>;

    public constructor(
        statusCode: number,
        code: string,
        message: string,
        details?: Record<string, unknown>,
    ) {
        super(message);
        this.name = 'HttpError';
        this.statusCode = statusCode;
        this.code = code;
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
        if (details !== undefined) this.details = details;
    }
}
