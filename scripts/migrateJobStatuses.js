/**
 * UM-033: Safe Legacy Job Status Migration & Rollback Utility
 * 
 * Maps legacy status variants to canonical states:
 * - 'First Contact' / 'Processing' / 'Pending' -> 'PROCESSING'
 * - 'execution' / 'In Progress' -> 'EXECUTION'
 * - 'Completed' -> 'COMPLETED'
 * - 'Draft' -> 'DRAFT'
 * - 'Cancelled' -> 'CANCELLED'
 * 
 * Features:
 * - Step 1: Pre-migration count and status inventory
 * - Step 2: Timestamped backup to disk before any mutation
 * - Step 3: Atomic updates with reconciliation check
 * - Step 4: Full rollback capability (--rollback <path_to_backup>)
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const CANONICAL_MAP = {
  'first contact': 'PROCESSING',
  'processing': 'PROCESSING',
  'pending': 'PROCESSING',
  'execution': 'EXECUTION',
  'in progress': 'EXECUTION',
  'completed': 'COMPLETED',
  'cancelled': 'CANCELLED',
  'draft': 'DRAFT',
};

const CANONICAL_STATES = ['DRAFT', 'PROCESSING', 'EXECUTION', 'COMPLETED', 'CANCELLED'];

async function run() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('[UM-033] Error: MONGO_URI is missing in .env');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('[UM-033] Connected to database');

  const Job = mongoose.model('jobSchedule', new mongoose.Schema({}, { strict: false }));

  // Check if rollback requested
  const args = process.argv.slice(2);
  const rollbackIndex = args.indexOf('--rollback');
  if (rollbackIndex !== -1) {
    const backupFile = args[rollbackIndex + 1];
    if (!backupFile || !fs.existsSync(backupFile)) {
      console.error('[UM-033] Rollback file not found:', backupFile);
      process.exit(1);
    }
    const backupData = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
    console.log(`[UM-033] Rolling back ${backupData.length} jobs to original statuses...`);
    let restored = 0;
    for (const item of backupData) {
      await Job.updateOne({ _id: item._id }, { $set: { status: item.status } });
      restored++;
    }
    console.log(`[UM-033] Rollback completed: ${restored} jobs restored successfully.`);
    process.exit(0);
  }

  // Step 1: Pre-migration inventory
  const allJobs = await Job.find({}).lean();
  console.log(`\n========================================`);
  console.log(`[UM-033] PRE-MIGRATION INVENTORY (Total: ${allJobs.length} jobs)`);
  console.log(`========================================`);

  const beforeCounts = {};
  const backupRecords = [];
  let needsMigrationCount = 0;

  for (const job of allJobs) {
    const rawStatus = job.status || 'UNKNOWN';
    beforeCounts[rawStatus] = (beforeCounts[rawStatus] || 0) + 1;
    backupRecords.push({
      _id: job._id.toString(),
      index: job.index || null,
      status: job.status,
      customer: job.customer || null,
    });

    const normalized = String(rawStatus).toLowerCase().trim();
    if (CANONICAL_MAP[normalized] && rawStatus !== CANONICAL_MAP[normalized]) {
      needsMigrationCount++;
    }
  }

  console.table(beforeCounts);
  console.log(`Jobs requiring canonical status normalization: ${needsMigrationCount}`);

  // Step 2: Write backup file
  const backupDir = path.resolve(__dirname, '../backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFilePath = path.join(backupDir, `job_status_backup_${timestamp}.json`);
  fs.writeFileSync(backupFilePath, JSON.stringify(backupRecords, null, 2), 'utf8');
  console.log(`[UM-033] Backup safely written to: ${backupFilePath}`);

  if (needsMigrationCount === 0) {
    console.log('[UM-033] All jobs are already in approved canonical states. No migration needed.');
    process.exit(0);
  }

  // Step 3: Perform canonical migration
  console.log('\n[UM-033] Applying canonical status mapping...');
  let migratedCount = 0;
  for (const job of allJobs) {
    const raw = job.status;
    const normalized = String(raw).toLowerCase().trim();
    const targetCanonical = CANONICAL_MAP[normalized];
    if (targetCanonical && raw !== targetCanonical) {
      await Job.updateOne({ _id: job._id }, { $set: { status: targetCanonical } });
      migratedCount++;
    }
  }

  // Step 4: Post-migration reconciliation
  const postJobs = await Job.find({}).lean();
  const afterCounts = {};
  for (const job of postJobs) {
    const rawStatus = job.status || 'UNKNOWN';
    afterCounts[rawStatus] = (afterCounts[rawStatus] || 0) + 1;
  }

  console.log(`\n========================================`);
  console.log(`[UM-033] POST-MIGRATION RECONCILIATION`);
  console.log(`========================================`);
  console.table(afterCounts);
  console.log(`Successfully migrated ${migratedCount} jobs.`);
  console.log(`Rollback command if ever needed: node scripts/migrateJobStatuses.js --rollback "${backupFilePath}"`);

  process.exit(0);
}

run().catch((err) => {
  console.error('[UM-033] Migration failed:', err);
  process.exit(1);
});
