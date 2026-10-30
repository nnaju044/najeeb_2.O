'use strict';

require('dotenv').config();
const path = require('path');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

async function migrate() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required in .env');
  }

  console.log('Connecting to Atlas...');
  const atlasConn = await mongoose.createConnection(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 15000,
  }).asPromise();
  console.log('Connected to Atlas successfully.');

  console.log('Reading local data directory...');
  const dataDir = path.join(__dirname, '..', '.data', 'mongo');
  const devServer = await MongoMemoryServer.create({
    instance: {
      dbPath: dataDir,
      storageEngine: 'wiredTiger',
      storageEngineOptions: { directoryForIndexes: true },
    },
  });

  const localConn = await mongoose.createConnection(devServer.getUri()).asPromise();
  const jeebsDb = localConn.useDb('jeebs_2o');
  const lifeosDb = localConn.useDb('lifeos');

  // 1. Get or create Najeeb's primary user account
  const najUser =
    (await jeebsDb.collection('users').findOne({ email: 'nnaju044@gmail.com' })) ||
    (await lifeosDb.collection('users').findOne({ email: 'owner@lifeos.test' }));

  if (!najUser) {
    console.warn('No existing user found in local data directory.');
    await localConn.close();
    await devServer.stop();
    await atlasConn.close();
    return;
  }

  // Ensure user exists on Atlas with their email nnaju044@gmail.com
  const userPayload = {
    ...najUser,
    email: 'nnaju044@gmail.com',
    name: najUser.name || 'Najeeb',
  };

  const targetUserId = najUser._id;
  await atlasConn.collection('users').updateOne(
    { _id: targetUserId },
    { $set: userPayload },
    { upsert: true }
  );
  console.log(`Migrated user account: ${userPayload.email} (${targetUserId})`);

  // 2. Collections to migrate and assign to targetUserId
  const userCollections = [
    'challenges',
    'hourlytimelogs',
    'waterentries',
    'mealentries',
    'sleepentries',
    'weightentries',
    'workouts',
    'worksessions',
    'habits',
    'habitcompletions',
    'achievements',
    'weeklyreports',
    'dailylogs',
    'favoritemeals',
  ];

  for (const colName of userCollections) {
    // Gather docs from both databases
    const docs1 = await lifeosDb.collection(colName).find({}).toArray();
    const docs2 = await jeebsDb.collection(colName).find({}).toArray();
    const allDocs = [...docs1, ...docs2];

    if (!allDocs.length) continue;

    let migrated = 0;
    for (const doc of allDocs) {
      const docToInsert = {
        ...doc,
        userId: targetUserId,
      };

      // For challenge, make sure userId is unique
      if (colName === 'challenges') {
        const existing = await atlasConn.collection('challenges').findOne({ userId: targetUserId });
        if (existing) continue;
      }

      // Upsert document by _id
      await atlasConn.collection(colName).updateOne(
        { _id: docToInsert._id },
        { $setOnInsert: docToInsert },
        { upsert: true }
      );
      migrated += 1;
    }
    console.log(`Migrated ${colName}: ${migrated} records assigned to ${targetUserId}`);
  }

  // Also migrate global libraries if needed
  for (const globalCol of ['foods', 'exercises']) {
    const localItems = await lifeosDb.collection(globalCol).find({}).toArray();
    for (const item of localItems) {
      await atlasConn.collection(globalCol).updateOne(
        { _id: item._id },
        { $setOnInsert: item },
        { upsert: true }
      );
    }
  }

  await localConn.close();
  await devServer.stop();
  await atlasConn.close();
  console.log('Migration to MongoDB Atlas completed successfully!');
}

migrate()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
