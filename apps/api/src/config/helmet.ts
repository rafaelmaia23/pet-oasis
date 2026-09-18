import helmet from "helmet";

/**
 * Preset do helmet com a CSP **mais estrita que o default**.
 *
 * O default já entrega `script-src 'self'`, mas libera `https:` e
 * `'unsafe-inline'` em `style-src`/`font-src` — folga pensada para páginas HTML
 * comuns. Esta API responde JSON: não carrega CSS nem fonte nenhuma, então as
 * duas diretivas ficam em `'self'`. A folga que a UI do Scalar exige vive
 * escopada em `docsCsp` (`src/docs/reference.ts`), aplicada só em `/reference`.
 */
export const helmetOptions: Parameters<typeof helmet>[0] = {
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "style-src": ["'self'"],
      "font-src": ["'self'"],
    },
  },
};
