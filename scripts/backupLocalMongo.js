'use strict';

const path = require('path');
const fs = require('fs');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

async function createBackup() {
  const dataDir = path.join(__dirname, '..', '.data', 'mongo');
  const backupDir = path.join(__dirname, '..', 'backups');
  const rawBackupDir = path.join(backupDir, 'mongo_raw_backup');
  const jsonBackupDir = path.join(backupDir, 'json_backup');

  fs.mkdirSync(rawBackupDir, { recursive: true });
  fs.mkdirSync(jsonBackupDir, { recursive: true });

  console.log('1. Copying raw local database files from', dataDir, 'to', rawBackupDir);
  // Copy directory recursively
  fs.cpSync(dataDir, rawBackupDir, { recursive: true });
  console.log('Raw database backup complete.');

  console.log('2. Reading data to generate JSON collection exports...');
  const devServer = await MongoMemoryServer.create({
    instance: {
      dbPath: dataDir,
      storageEngine: 'wiredTiger',
      storageEngineOptions: { directoryForIndexes: true },
    },
  });

  const localConn = await mongoose.createConnection(devServer.getUri()).asPromise();
  const dbs = ['lifeos', 'jeebs_2o'];

  for (const dbName of dbs) {
    const db = localConn.useDb(dbName);
    const collections = await db.listCollections();
    const subDir = path.join(jsonBackupDir, dbName);
    fs.mkdirSync(subDir, { recursive: true });

    console.log(`Dumping database "${dbName}"...`);
    for (const colInfo of collections) {
      const colName = colInfo.name;
      if (colName.startsWith('system.')) continue;
      const docs = await db.collection(colName).find({}).toArray();
      const outPath = path.join(subDir, `${colName}.json`);
      fs.writeFileSync(outPath, JSON.stringify(docs, null, 2), 'utf-8');
      console.log(`  - ${colName}: ${docs.length} documents saved to ${path.basename(outPath)}`);
    }
  }

  await localConn.close();
  await devServer.stop();
  console.log('All local database backups completed successfully in:', backupDir);
}

createBackup().catch((err) => {
  console.error('Backup failed:', err);
  process.exit(1);
});
