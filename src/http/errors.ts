/** Declara o erro HTTP conhecido, preservando status e código para o handler. */
// API pública do módulo: `HttpError` define a interface pública consumida pelos demais módulos.
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
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
        if (details !== undefined) this.details = details;
    }
}
