'use strict';

require('dotenv').config();
const mongoose = require('mongoose');

async function testCRUD() {
  console.log('Connecting to Atlas for CRUD testing...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected.');

  const db = mongoose.connection;
  const user = await db.collection('users').findOne({ email: 'nnaju044@gmail.com' });
  if (!user) throw new Error('User not found in Atlas');

  console.log('User found:', user.email, 'ID:', user._id);

  // 1. CREATE test record
  console.log('\n--- 1. CREATE ---');
  const testWater = {
    userId: user._id,
    dateKey: '2026-10-31',
    amountMl: 250,
    loggedAt: new Date(),
    isTest: true,
  };
  const insertResult = await db.collection('waterentries').insertOne(testWater);
  console.log('Created water entry with ID:', insertResult.insertedId);

  // 2. READ test record
  console.log('\n--- 2. READ ---');
  const readRecord = await db.collection('waterentries').findOne({ _id: insertResult.insertedId });
  console.log('Read water entry:', readRecord ? `Amount: ${readRecord.amountMl}ml, Date: ${readRecord.dateKey}` : 'FAILED');
  if (!readRecord || readRecord.amountMl !== 250) throw new Error('Read verification failed');

  // 3. UPDATE test record
  console.log('\n--- 3. UPDATE ---');
  const updateResult = await db.collection('waterentries').updateOne(
    { _id: insertResult.insertedId },
    { $set: { amountMl: 500 } }
  );
  console.log('Updated matched count:', updateResult.matchedCount, 'modified count:', updateResult.modifiedCount);
  const updatedRecord = await db.collection('waterentries').findOne({ _id: insertResult.insertedId });
  console.log('Verified updated amount:', updatedRecord.amountMl, 'ml');
  if (updatedRecord.amountMl !== 500) throw new Error('Update verification failed');

  // 4. DELETE test record
  console.log('\n--- 4. DELETE ---');
  const deleteResult = await db.collection('waterentries').deleteOne({ _id: insertResult.insertedId });
  console.log('Deleted count:', deleteResult.deletedCount);
  const deletedCheck = await db.collection('waterentries').findOne({ _id: insertResult.insertedId });
  console.log('Verified deletion (should be null):', deletedCheck);
  if (deletedCheck !== null) throw new Error('Delete verification failed');

  console.log('\nAtlas CRUD operations successfully tested and verified!');
  await mongoose.disconnect();
}

testCRUD().catch(err => {
  console.error('CRUD test failed:', err);
  process.exit(1);
});
