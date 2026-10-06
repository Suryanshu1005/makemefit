import { buildServer } from './server';
import { env } from './config/env';
import { logger } from './core/logger';
import { checkDatabaseConnection, closeDatabaseConnection } from './database';

async function start() {
  try {
    const server = await buildServer();

    // Verify initial database connection (logs warning if offline without crashing app startup)
    await checkDatabaseConnection();

    await server.listen({ port: env.PORT, host: env.HOST });
    logger.info(`🚀 MakeMeFit API server listening on http://${env.HOST}:${env.PORT}`);

    // Graceful shutdown handling
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
    for (const signal of signals) {
      process.on(signal, async () => {
        logger.info(`Received ${signal}. Shutting down gracefully...`);
        await server.close();
        await closeDatabaseConnection();
        process.exit(0);
      });
    }
  } catch (err) {
    logger.error({ err }, 'Failed to start API server');
    process.exit(1);
  }
}

start();
