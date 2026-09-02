import "dotenv/config";

import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),

  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  DATABASE_URL: z.url(),

  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default("15m"),

  PEPPER: z.string().min(32),

  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default("Pet Oasis <no-reply@petoasis.dev>"),
  APP_URL: z.url().default("http://localhost:5173"),

  SEED_DEMO_USER: z.stringbool().default(false),
  DEMO_EMAIL: z.email().default("demo@petoasis.dev"),
  DEMO_PASSWORD: z.string().default("DemoOasis2026!"),

  // Dataset de usuários fake (customers/employees/híbridos + exemplos de
  // ban/pendência/soft delete) — para popular dev e o demo público com dado
  // de verdade. Uma senha única e conhecida para todo o dataset (não o
  // admin, que tem a própria) — dá pra logar como qualquer um pra testar.
  SEED_FAKE_DATA: z.stringbool().default(false),
  SEED_FAKE_USER_PASSWORD: z.string().default("FakeOasis2026!"),

  // Usuário admin de teste com acesso total (não-readonly) — flag
  // independente de SEED_FAKE_DATA. NUNCA true em produção/demo: diferente
  // do usuário demo (só leitura), este teria escrita irrestrita exposta na
  // internet. Só para dev/local.
  SEED_ADMIN_USER: z.stringbool().default(false),
  SEED_ADMIN_EMAIL: z.email().default("admin@petoasis.dev"),
  SEED_ADMIN_PASSWORD: z.string().default("AdminOasis2026!"),

  // Forma HOST (localhost) — o container recebe `redis://redis:6379` pelo
  // override do Compose, mesmo idioma da DATABASE_URL.
  REDIS_URL: z.url().default("redis://localhost:6379"),

  // `info` é o default de produção; dev sobe para `debug` pelo .env.development.
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  LOG_BUFFER_SIZE: z.coerce.number().int().positive().default(500),

  // Origens extras (staging/preview) além do APP_URL, separadas por vírgula.
  CORS_ALLOWED_ORIGINS: z.string().optional(),

  // Teto do corpo JSON aceito pelo body-parser (sintaxe do pacote `bytes`).
  JSON_BODY_LIMIT: z.string().default("100kb"),

  // Rate limiting (7.9) — janela deslizante por IP e por email-alvo, contada
  // no Redis via `rate-limiter-flexible`. Duas vars por regra (MAX + WINDOW_MS)
  // em vez de uma string composta: mesmo idioma do LOCKOUT_* abaixo, sem
  // parser novo no projeto.
  RATE_LIMIT_LOGIN_MAX: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_LOGIN_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60 * 1000),
  RATE_LIMIT_SIGNUP_MAX: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_SIGNUP_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 1000),
  // Compartilhado entre forgot-password e verify-email/resend (mesma linha no
  // ADR de rate limiting: um contador só por IP para as duas rotas).
  RATE_LIMIT_EMAIL_MAX: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_EMAIL_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 1000),
  RATE_LIMIT_EMAIL_TARGET_MAX: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_EMAIL_TARGET_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 1000),
  // 8.7/K26: as três rotas públicas que consomem token opaco (reset-password,
  // confirm-email-change, confirm-account-reactivation), num contador por IP.
  // Consumir token é clique de link: o par do login (20 / 15 min) absorve NAT
  // de escritório sem abrir espaço para adivinhação.
  RATE_LIMIT_TOKEN_MAX: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_TOKEN_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60 * 1000),
  // 9.6: leitura pública do catálogo (breeds, brands, categories, tags e, na
  // 9.8, products), por IP — a primeira superfície de leitura em volume sem
  // ator, então não há balde por usuário possível. O teto é folgado de
  // propósito: navegar a vitrine são muitos GETs legítimos em sequência, e um
  // limite apertado quebraria o visitante antes de incomodar o scraper.
  RATE_LIMIT_CATALOG_MAX: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_CATALOG_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60 * 1000),

  // 9.10: upload de imagem, contado **por usuário** (AA18) e não por IP — o
  // primeiro limiter do projeto com chave que não é IP nem email. Por IP
  // atropelaria o mutirão de cadastro inicial, em que vários funcionários
  // saem pelo mesmo NAT; e o que este balde barra (script bugado, conta
  // comprometida) é propriedade de uma conta, não de uma saída de rede.
  RATE_LIMIT_UPLOAD_MAX: z.coerce.number().int().positive().default(150),
  RATE_LIMIT_UPLOAD_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60 * 1000),

  // Account lockout (7.10) — janela fixa inicial, dobrando a cada ciclo até o
  // teto. Contador vive no Redis (`src/lib/lockout.ts`), sem coluna nova no User.
  LOCKOUT_THRESHOLD: z.coerce.number().int().positive().default(5),
  LOCKOUT_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60 * 1000),
  LOCKOUT_MAX_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(24 * 60 * 60 * 1000),

  // Destinos externos (7.11) — ambos ativam só quando as próprias vars estão
  // presentes; ausentes, a app degrada para stdout/ring buffer (Axiom) ou
  // captureException vira no-op (Sentry), nunca bloqueia o boot (D6).
  AXIOM_TOKEN: z.string().optional(),
  AXIOM_DATASET: z.string().optional(),
  SENTRY_DSN: z.url().optional(),

  // Timeouts (7.12) — sem eles, uma dependência pendurada (Redis que aceita a
  // conexão mas não responde, relay SMTP morto, pool sem conexão livre) trava
  // o request pelo timeout de socket do SO em vez de falhar rápido. Todos
  // configuráveis, defaults conservadores.
  SERVER_HEADERS_TIMEOUT_MS: z.coerce.number().int().positive().default(65_000),
  SERVER_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(70_000),
  SERVER_KEEP_ALIVE_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(61_000),

  PRISMA_TX_MAX_WAIT_MS: z.coerce.number().int().positive().default(5_000),
  PRISMA_TX_TIMEOUT_MS: z.coerce.number().int().positive().default(8_000),
  DB_POOL_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),

  REDIS_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(2_000),
  REDIS_COMMAND_TIMEOUT_MS: z.coerce.number().int().positive().default(2_000),

  SMTP_CONNECTION_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(10_000),
  SMTP_GREETING_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
  SMTP_SOCKET_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),

  // Manutenção e faxina (7.13) — teto de sessões vivas por usuário (evict da
  // mais antiga ao logar, login nunca é recusado) e retenção de registros
  // técnicos mortos, apagados só pelos scripts em src/scripts/ (nunca no
  // ciclo request/response). AUDIT_LOG_RETENTION_DAYS usa 365 (produção) como
  // default conservador; o deploy demo sobrescreve para 21 no seu próprio
  // .env.production.
  MAX_LIVE_SESSIONS: z.coerce.number().int().positive().default(5),
  SESSION_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  AUDIT_LOG_RETENTION_DAYS: z.coerce.number().int().positive().default(365),

  // Upload de imagem (9.10) — o que varia por ambiente ou é botão de operação
  // fica aqui; o que é regra de domínio (8 imagens por produto, as dimensões
  // de cada dono, os formatos aceitos) é constante em `src/lib/storage/`.
  // AA19: regra que mora em env é regra que ninguém acha ao ler o domínio.
  //
  // UPLOAD_DIR é montado por bind mount no Compose (AA2), e não por volume
  // nomeado, justamente para que trocar quem serve o byte — hoje o próprio
  // Node, amanhã um `alias` no nginx — seja configuração e não código.
  UPLOAD_DIR: z.string().default("./uploads"),
  // Base **pública**, não caminho de disco: o banco guarda a chave, e a URL
  // completa nasce daqui. Trocar o domínio (ou pôr um CDN na frente) é mudar
  // esta variável, sem tocar em nenhuma linha gravada.
  UPLOAD_PUBLIC_BASE_URL: z.url().default("http://localhost:3000/uploads"),
  UPLOAD_MAX_FILE_SIZE_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(5 * 1024 * 1024),
  // Carência da varredura de órfãos (`src/scripts/cleanup-uploads.ts`). Env
  // como os demais valores de retenção (SESSION_RETENTION_DAYS,
  // AUDIT_LOG_RETENTION_DAYS), e não constante: é botão de operação, e um
  // deploy com upload lento pode legitimamente querer mais folga. Abaixar para
  // perto de zero reintroduz o risco de apagar upload em voo.
  UPLOAD_ORPHAN_GRACE_HOURS: z.coerce.number().int().positive().default(24),

  // Guarda explícita do demo-reset.ts (truncate + reseed, 7.14) — NUNCA
  // inferida de NODE_ENV, porque o deploy demo *é* production. Só true no
  // .env.production de um deploy demo de verdade.
  DEMO_MODE: z.stringbool().default(false),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error(
    "Invalid environment variables:",
    z.treeifyError(parsedEnv.error),
  );
  process.exit(1);
}

export const env = parsedEnv.data;
