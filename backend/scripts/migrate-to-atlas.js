require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { MongoClient } = require('mongodb');

const LOCAL_URI = process.env.LOCAL_MONGO_URI || 'mongodb://127.0.0.1:27017/fusion';
const TARGET_URI = process.env.MONGO_URI;

async function migrate() {
  console.log('--- MongoDB Data Migration Tool ---');

  if (!TARGET_URI || TARGET_URI.includes('<db_username>') || TARGET_URI.includes('<db_password>')) {
    console.error('❌ Error: MONGO_URI in backend/.env still contains placeholders (<db_username> or <db_password>).');
    console.error('Please update backend/.env with your actual MongoDB Atlas username and password.');
    process.exit(1);
  }

  console.log('Connecting to Local MongoDB:', LOCAL_URI);
  const localClient = new MongoClient(LOCAL_URI);
  await localClient.connect();
  const localDb = localClient.db();

  console.log('Connecting to Target MongoDB (Atlas)...');
  const targetClient = new MongoClient(TARGET_URI);
  await targetClient.connect();
  const targetDb = targetClient.db();

  const collections = await localDb.listCollections().toArray();
  console.log(`Found ${collections.length} collections in local database: ${collections.map(c => c.name).join(', ')}`);

  for (const col of collections) {
    const colName = col.name;
    const localCollection = localDb.collection(colName);
    const targetCollection = targetDb.collection(colName);

    const count = await localCollection.countDocuments();
    if (count === 0) {
      console.log(`⏩ [${colName}] 0 documents, skipping.`);
      continue;
    }

    console.log(`📦 [${colName}] Migrating ${count} documents...`);
    const docs = await localCollection.find({}).toArray();

    // Clear target collection first to avoid duplicate _id conflicts
    await targetCollection.deleteMany({});
    await targetCollection.insertMany(docs);

    const targetCount = await targetCollection.countDocuments();
    console.log(`✅ [${colName}] Successfully migrated ${targetCount}/${count} documents.`);
  }

  await localClient.close();
  await targetClient.close();
  console.log('\n🎉 All collections successfully migrated to MongoDB Atlas!');
}

migrate().catch(err => {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
});
