import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import { config } from './config.js';
import { registerRoutes } from './routes.js';

const app = Fastify({ logger: true });

// Restrict CORS to configured origins in production; allow all only when none set (dev).
await app.register(cors, {
  origin: config.allowedOrigins.length > 0 ? config.allowedOrigins : true,
});
await app.register(rateLimit, {
  max: 150,
  timeWindow: '1 minute',
});

app.setErrorHandler((err, _req, reply) => {
  if (err instanceof ZodError) {
    return reply.code(400).send({ error: 'validation_error', issues: err.issues });
  }
  const e = err as { statusCode?: number; message?: string };
  const statusCode = e.statusCode ?? 500;
  reply.code(statusCode).send({ error: e.message ?? 'internal_error' });
});

await registerRoutes(app);

app
  .listen({ port: config.port, host: '0.0.0.0' })
  .then(() => app.log.info(`FarmOS core API on :${config.port}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
