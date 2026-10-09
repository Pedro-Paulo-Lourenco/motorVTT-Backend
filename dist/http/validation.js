export function validate(schemas) {
    const middleware = (req, res, next) => {
        try {
            res.locals.validated = {
                body: schemas.body?.parse(req.body),
                query: schemas.query?.parse(req.query),
                params: schemas.params?.parse(req.params),
            };
            next();
        }
        catch (error) {
            next(error);
        }
    };
    return middleware;
}
//# sourceMappingURL=validation.js.map