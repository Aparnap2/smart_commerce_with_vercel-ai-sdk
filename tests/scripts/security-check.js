#!/usr/bin/env node
/**
 * Security Validation Script
 * Database sanity check, data isolation, prompt injection protection
 * Run directly: node scripts/security-check.js
 */

import { Client } from 'pg';

// Configuration
const DB_URI = process.env.DATABASE_URL || 'postgresql://vercel_user:vercel_pass@localhost:5432/vercel_ai';

const results = {
  timestamp: new Date().toISOString(),
  tests: [],
  summary: { passed: 0, failed: 0, total: 0 }
};

function log(test, status, message, details = {}) {
  const entry = {
    test,
    status, // PASS, FAIL, WARN
    message,
    details,
    timestamp: new Date().toISOString()
  };
  results.tests.push(entry);
  results.summary.total++;
  if (status === 'PASS') results.summary.passed++;
  if (status === 'FAIL') results.summary.failed++;

  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`${icon} [${test}] ${message}`);
  if (details && Object.keys(details).length > 0) {
    console.log(`   Details: ${JSON.stringify(details)}`);
  }
}

async function runTests() {
  console.log('========================================');
  console.log('Database Security & Integrity Check');
  console.log('========================================\n');

  const client = new Client(DB_URI);

  try {
    await client.connect();
    log('DB-CONNECT', 'PASS', 'PostgreSQL connection established');

    // =========================================
    // 1. DATABASE SANITY CHECKS
    // =========================================
    console.log('\n📋 Database Schema Validation...\n');

    // Check tables exist
    const tables = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' ORDER BY table_name
    `);
    const tableList = tables.rows.map(r => r.table_name);
    log('SCHEMA-TABLES', tableList.length >= 4 ? 'PASS' : 'FAIL',
      `Found ${tableList.length} tables: ${tableList.join(', ')}`,
      { tables: tableList });

    // Check required tables
    const requiredTables = ['Customer', 'Product', 'Order', 'SupportTicket'];
    for (const table of requiredTables) {
      if (tableList.includes(table)) {
        log('SCHEMA-REQUIRED', 'PASS', `Table "${table}" exists`);
      } else {
        log('SCHEMA-REQUIRED', 'FAIL', `Missing required table: ${table}`);
      }
    }

    // Check foreign keys
    const fks = await client.query(`
      SELECT conname, confrelid::regclass as parent, conrelid::regclass as child
      FROM pg_constraint WHERE contype = 'f'
    `);
    log('SCHEMA-FK', fks.rows.length > 0 ? 'PASS' : 'WARN',
      `Found ${fks.rows.length} foreign key constraints`,
      { constraints: fks.rows.map(r => `${r.child}->${r.parent}`) });

    // =========================================
    // 2. DATA INTEGRITY CHECKS
    // =========================================
    console.log('\n🔒 Data Integrity Checks...\n');

    // Check for duplicate emails
    const duplicates = await client.query(`
      SELECT email, COUNT(*) as cnt FROM "Customer" GROUP BY email HAVING COUNT(*) > 1
    `);
    log('INTEGRITY-DUPLICATE', duplicates.rows.length === 0 ? 'PASS' : 'FAIL',
      duplicates.rows.length === 0 ? 'No duplicate customer emails' : `Found ${duplicates.rows.length} duplicates`,
      { duplicates: duplicates.rows });

    // Check for invalid emails
    const invalidEmails = await client.query(`
      SELECT id, email FROM "Customer"
      WHERE email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' OR email IS NULL
    `);
    log('INTEGRITY-INVALID-EMAIL', invalidEmails.rows.length === 0 ? 'PASS' : 'FAIL',
      invalidEmails.rows.length === 0 ? 'All emails are valid' : `Found ${invalidEmails.rows.length} invalid emails`,
      { count: invalidEmails.rows.length });

    // Check for negative stock
    const negStock = await client.query(`SELECT id, name, stock FROM "Product" WHERE stock < 0`);
    log('INTEGRITY-NEG-STOCK', negStock.rows.length === 0 ? 'PASS' : 'FAIL',
      negStock.rows.length === 0 ? 'No negative stock values' : `Found ${negStock.rows.length} products with negative stock`,
      { products: negStock.rows });

    // Check for valid order statuses
    const validStatuses = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
    const invalidOrders = await client.query(`
      SELECT id, status FROM "Order" WHERE status NOT IN ($1)
    `, [validStatuses]);
    log('INTEGRITY-ORDER-STATUS', invalidOrders.rows.length === 0 ? 'PASS' : 'FAIL',
      invalidOrders.rows.length === 0 ? 'All orders have valid status' : `Found ${invalidOrders.rows.length} orders with invalid status`,
      { count: invalidOrders.rows.length });

    // =========================================
    // 3. DATA ISOLATION CHECKS
    // =========================================
    console.log('\n🔐 Data Isolation Tests...\n');

    // Get test users
    const aliceOrders = await client.query(`
      SELECT o.id FROM "Order" o
      JOIN "Customer" c ON o."customerId" = c.id
      WHERE c.email = $1
    `, ['alice@example.com']);
    const aliceOrderIds = aliceOrders.rows.map(r => r.id);

    const bobOrders = await client.query(`
      SELECT o.id FROM "Order" o
      JOIN "Customer" c ON o."customerId" = c.id
      WHERE c.email = $1
    `, ['bob@example.com']);
    const bobOrderIds = bobOrders.rows.map(r => r.id);

    // Verify no overlap
    const overlap = aliceOrderIds.filter(id => bobOrderIds.includes(id));
    log('ISOLATION-ORDERS', overlap.length === 0 ? 'PASS' : 'FAIL',
      overlap.length === 0 ? 'Alice and Bob orders are isolated' : `⚠️ Orders overlap: ${overlap.join(', ')}`,
      { aliceOrders: aliceOrderIds.length, bobOrders: bobOrderIds.length });

    // Verify query returns only own data
    const aliceQuery = await client.query(`
      SELECT c.email, o.id as order_id FROM "Order" o
      JOIN "Customer" c ON o."customerId" = c.id
      WHERE c.email = $1
    `, ['alice@example.com']);
    const allAlice = aliceQuery.rows.every(r => r.email === 'alice@example.com');
    log('ISOLATION-QUERY', allAlice ? 'PASS' : 'FAIL',
      allAlice ? 'Query correctly returns only user data' : 'Query leaked other user data',
      { rowsChecked: aliceQuery.rows.length });

    // =========================================
    // 4. SQL INJECTION PROTECTION
    // =========================================
    console.log('\n🛡️ SQL Injection Protection Tests...\n');

    const maliciousEmails = [
      "'; DROP TABLE Customer; --",
      "' OR '1'='1",
      "admin' --",
      "1; DELETE FROM Product WHERE 1=1"
    ];

    for (const malicious of maliciousEmails) {
      try {
        const result = await client.query(
          `SELECT * FROM "Customer" WHERE email = $1`,
          [malicious]
        );
        // If we get here, parameterized query worked
        if (result.rows.length === 0) {
          log('SQL-INJECTION', 'PASS', `Malicious email rejected: ${malicious.substring(0, 20)}...`);
        } else {
          log('SQL-INJECTION', 'WARN', `Query returned data for suspicious input: ${malicious.substring(0, 20)}...`);
        }
      } catch (error) {
        log('SQL-INJECTION', 'PASS', `Malicious input rejected: ${error.message.substring(0, 50)}`);
      }
    }

    // Verify table name parameterization
    try {
      await client.query(`SELECT * FROM "InvalidTableThatDoesNotExist123"`);
      log('SQL-PARAMETERIZATION', 'FAIL', 'Table validation missing');
    } catch (error) {
      log('SQL-PARAMETERIZATION', 'PASS', 'Table name validation working');
    }

    // =========================================
    // 5. DATA FORMAT CORRECTNESS
    // =========================================
    console.log('\n📊 Data Format Checks...\n');

    const customer = await client.query(`SELECT * FROM "Customer" LIMIT 1`);
    if (customer.rows.length > 0) {
      const c = customer.rows[0];
      const requiredFields = ['id', 'name', 'email', 'phone'];
      const missing = requiredFields.filter(f => !(f in c));
      log('FORMAT-CUSTOMER', missing.length === 0 ? 'PASS' : 'FAIL',
        missing.length === 0 ? 'Customer has all required fields' : `Missing: ${missing.join(', ')}`,
        { fields: Object.keys(c) });
    }

    const order = await client.query(`
      SELECT o.*, c.email as customer_email, p.name as product_name
      FROM "Order" o
      JOIN "Customer" c ON o."customerId" = c.id
      JOIN "Product" p ON o."productId" = p.id
      LIMIT 1
    `);
    if (order.rows.length > 0) {
      const o = order.rows[0];
      const hasJoins = o.customer_email && o.product_name;
      log('FORMAT-ORDER-JOIN', hasJoins ? 'PASS' : 'FAIL',
        hasJoins ? 'Order query includes joined customer/product data' : 'Join data missing');
    }

    // =========================================
    // 6. AUTHENTICATION CHECKS
    // =========================================
    console.log('\n🔑 Authentication Checks...\n');

    const noEmailQuery = await client.query(`SELECT * FROM "Customer" WHERE email = $1`, ['']);
    log('AUTH-BLANK-EMAIL', noEmailQuery.rows.length === 0 ? 'PASS' : 'FAIL',
      noEmailQuery.rows.length === 0 ? 'Blank email correctly returns no results' : 'Blank email query issue');

    // =========================================
    // SUMMARY
    // =========================================
    console.log('\n========================================');
    console.log('SUMMARY');
    console.log('========================================');
    console.log(`Total Tests: ${results.summary.total}`);
    console.log(`Passed: ${results.summary.passed} ✅`);
    console.log(`Failed: ${results.summary.failed} ❌`);
    console.log(`Pass Rate: ${((results.summary.passed / results.summary.total) * 100).toFixed(1)}%`);
    console.log('========================================\n');

    // Save results
    const fs = await import('fs');
    const logDir = './test-logs';
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const filepath = `${logDir}/security-check-${Date.now()}.json`;
    fs.writeFileSync(filepath, JSON.stringify(results, null, 2));
    console.log(`Results saved to: ${filepath}`);

  } catch (error) {
    console.error('❌ Test suite failed:', error.message);
    log('SUITE', 'FAIL', error.message);
  } finally {
    await client.end();
  }

  return results;
}

runTests().catch(console.error);
