'use strict';

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { createApp } = require('./app');
const { connectDatabase, disconnectDatabase } = require('./config/db');
const { ensureGlobalLibraries } = require('./services/seedService');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';

let devMongo = null;
let httpServer = null;

/**
 * Production always uses MONGODB_URI (Atlas). For a local run without an Atlas
 * string, a real MongoDB process is started on this machine with an on-disk data
 * directory so data survives restarts. Nothing about this fallback touches
 * production behaviour, and it refuses to run when NODE_ENV=production.
 */
async function resolveMongoUri() {
  if (process.env.MONGODB_URI) {
    return { uri: process.env.MONGODB_URI, fallback: false };
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('MONGODB_URI must be set in production (use your MongoDB Atlas connection string).');
  }
  const { MongoMemoryServer } = require('mongodb-memory-server');
  const dataDir = path.join(__dirname, '.data', 'mongo');
  fs.mkdirSync(dataDir, { recursive: true });
  try {
    devMongo = await MongoMemoryServer.create({
      instance: {
        dbPath: dataDir,
        storageEngine: 'wiredTiger',
        storageEngineOptions: { directoryForIndexes: true },
      },
    });
  } catch (error) {
    if (error.message?.includes('DBPathInUse') || error.message?.includes('mongod.lock')) {
      throw new Error(
        `Another instance of Jeebs 2.O is already running on port ${PORT} using ${dataDir}.\n` +
        `Please stop the existing process before starting a new instance.`
      );
    }
    throw error;
  }
  console.warn('[dev] MONGODB_URI is not set — started a local MongoDB for development.');
  console.warn(`[dev] data directory: ${dataDir}`);
  return { uri: devMongo.getUri('jeebs_2o'), fallback: true };
}

async function start() {
  const { uri, fallback } = await resolveMongoUri();
  await connectDatabase(uri, { attempts: 5 });
  await ensureGlobalLibraries();

  let sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SESSION_SECRET must be set in production.');
    }
    sessionSecret = crypto.randomBytes(32).toString('hex');
    console.warn('[dev] SESSION_SECRET is not set — generated an ephemeral one (sessions reset on restart).');
  }

  const app = createApp({
    mongoUrl: uri,
    sessionSecret,
    secureCookies: process.env.NODE_ENV === 'production' && process.env.COOKIE_INSECURE !== 'true',
  });

  httpServer = app.listen(PORT, HOST, () => {
    console.info(`Jeebs 2.O running at http://${HOST}:${PORT}`);
    if (fallback) console.info('[dev] local MongoDB fallback active — add MONGODB_URI to .env to use Atlas');
  });

  const shutdown = async (signal) => {
    console.info(`\n${signal} received — shutting down…`);
    httpServer?.close();
    try {
      await disconnectDatabase();
      await devMongo?.stop();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((error) => {
  console.error('[startup] failed:', error.message);
  process.exit(1);
});
