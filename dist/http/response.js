export function sendSuccess(res, status, data, message) {
    const response = {
        success: true,
        data,
    };
    if (message !== undefined)
        response.message = message;
    if (res.locals.correlationId !== undefined) {
        response.correlationId = res.locals.correlationId;
    }
    res.status(status).json(response);
}
export function sendError(res, status, code, message, details) {
    const error = { code, message };
    if (details !== undefined)
        error.details = details;
    if (res.locals.correlationId !== undefined) {
        error.correlationId = res.locals.correlationId;
    }
    res.status(status).json({ success: false, error });
}
//# sourceMappingURL=response.js.map