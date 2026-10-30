'use strict';

const mongoose = require('mongoose');

const states = ['disconnected', 'connected', 'connecting', 'disconnecting', 'uninitialized'];

let lastError = null;

function connectionState() {
  return states[mongoose.connection.readyState] || 'unknown';
}

function attachListeners() {
  const conn = mongoose.connection;
  conn.on('error', (error) => {
    lastError = error;
    console.error('[db] connection error:', error.message);
  });
  conn.on('disconnected', () => console.warn('[db] disconnected'));
  conn.on('reconnected', () => console.info('[db] reconnected'));
}

async function connectDatabase(uri, { attempts = 5, delayMs = 1500 } = {}) {
  if (!uri) throw new Error('A MongoDB connection string is required');
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }
  mongoose.set('strictQuery', true);
  if (!mongoose.connection.listeners('error').length) attachListeners();

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 10000,
        maxPoolSize: 20,
        retryWrites: true,
      });
      lastError = null;
      return mongoose.connection;
    } catch (error) {
      lastError = error;
      if (attempt === attempts) throw error;
      console.warn(`[db] connection attempt ${attempt} failed, retrying…`);
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }
  throw lastError;
}

async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
}

module.exports = { connectDatabase, disconnectDatabase, connectionState, lastError: () => lastError };
