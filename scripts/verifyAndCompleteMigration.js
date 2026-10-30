'use strict';

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

async function verifyAndReconcile() {
  const jsonBackupDir = path.join(__dirname, '..', 'backups', 'json_backup', 'lifeos');
  if (!fs.existsSync(jsonBackupDir)) {
    throw new Error('Local JSON backup directory not found: ' + jsonBackupDir);
  }

  console.log('Connecting to Atlas cluster...');
  const atlas = await mongoose.createConnection(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 15000,
  }).asPromise();
  console.log('Connected to Atlas DB:', atlas.name);

  // 1. Identify primary user
  const localUsers = JSON.parse(fs.readFileSync(path.join(jsonBackupDir, 'users.json'), 'utf-8'));
  const localOwner = localUsers[0];
  if (!localOwner) throw new Error('No user found in local backup users.json');

  const atlasUser = await atlas.collection('users').findOne({ email: 'nnaju044@gmail.com' });
  if (!atlasUser) {
    throw new Error('Atlas user nnaju044@gmail.com not found!');
  }
  const targetUserId = atlasUser._id;
  const sourceUserId = new mongoose.Types.ObjectId(String(localOwner._id));

  console.log(`Mapping records from local user ${sourceUserId} to Atlas user ${targetUserId} (${atlasUser.email})`);

  const collections = [
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
    'foods',
    'exercises',
  ];

  console.log('\n--- COLLECTION RECONCILIATION ---');
  console.log(
    'Collection'.padEnd(20) +
    'Local (backup)'.padEnd(16) +
    'Atlas (live)'.padEnd(16) +
    'Status'
  );
  console.log('-'.repeat(60));

  for (const col of collections) {
    const file = path.join(jsonBackupDir, `${col}.json`);
    let localDocs = [];
    if (fs.existsSync(file)) {
      localDocs = JSON.parse(fs.readFileSync(file, 'utf-8'));
    }

    // Check if any local document is missing from Atlas
    for (const doc of localDocs) {
      const docId = new mongoose.Types.ObjectId(String(doc._id));
      const existing = await atlas.collection(col).findOne({ _id: docId });
      if (!existing) {
        // Remap userId if document belongs to the local user
        const toInsert = { ...doc, _id: docId };
        if (doc.userId) {
          toInsert.userId = targetUserId;
        }
        await atlas.collection(col).insertOne(toInsert);
      }
    }

    // Count in Atlas
    const atlasCount = await atlas.collection(col).countDocuments({});
    const localCount = localDocs.length;
    const isTransferred = atlasCount >= localCount;

    console.log(
      col.padEnd(20) +
      String(localCount).padEnd(16) +
      String(atlasCount).padEnd(16) +
      (isTransferred ? 'OK (All Transferred)' : 'ATTENTION')
    );
  }

  console.log('-'.repeat(60));

  // Inspect important historical records
  console.log('\n--- IMPORTANT RECORDS VERIFICATION ---');
  const user = await atlas.collection('users').findOne({ email: 'nnaju044@gmail.com' });
  console.log('User Account:', user.email, '| Name:', user.name, '| Has passwordHash:', !!user.passwordHash);

  const challenge = await atlas.collection('challenges').findOne({ userId: targetUserId });
  console.log('Challenge:', challenge ? `Start: ${challenge.startDate}, Duration: ${challenge.durationDays}d` : 'None');

  const habits = await atlas.collection('habits').find({ userId: targetUserId }).toArray();
  console.log('Habits count for user:', habits.length);

  const timeLogs = await atlas.collection('hourlytimelogs').find({ userId: targetUserId }).toArray();
  console.log('Hourly logs for user:', timeLogs.length, 'Dates:', timeLogs.map(l => `${l.dateKey} h${l.hour}`));

  const water = await atlas.collection('waterentries').find({ userId: targetUserId }).toArray();
  console.log('Water entries for user:', water.length, 'Amounts:', water.map(w => `${w.amountMl}ml`));

  const meals = await atlas.collection('mealentries').find({ userId: targetUserId }).toArray();
  console.log('Meal entries for user:', meals.length, 'Types:', meals.map(m => m.mealType));

  const workouts = await atlas.collection('workouts').find({ userId: targetUserId }).toArray();
  console.log('Workouts for user:', workouts.length);

  const sleep = await atlas.collection('sleepentries').find({ userId: targetUserId }).toArray();
  console.log('Sleep entries for user:', sleep.length);

  await atlas.close();
  console.log('\nAtlas verification complete.');
}

verifyAndReconcile().catch((err) => {
  console.error('Reconciliation error:', err);
  process.exit(1);
});
