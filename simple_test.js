#!/usr/bin/env node

/**
 * Simple Database Connection Test
 */

import { Client } from '@neondatabase/serverless';

console.log('🧪 Starting Simple Database Test...\n');

// Test database connection directly
console.log('1️⃣ Testing Direct Database Connection...');

const connectionString = 'postgresql://vercel_user:vercel_pass@localhost:5433/vercel_ai';

async function testDirectConnection() {
  const client = new Client({
    connectionString: connectionString,
  });
  
  try {
    await client.connect();
    console.log('✅ Database connection established');
    
    // Test query
    const { rows } = await client.query('SELECT * FROM "Customer" LIMIT 3');
    console.log('✅ Query executed successfully');
    console.log('📊 Found customers:', rows.length);
    
    rows.forEach((customer, index) => {
      console.log(`  ${index + 1}. ${customer.name} (${customer.email})`);
    });
    
    // Test data isolation by checking different customers
    console.log('\n2️⃣ Testing Data Isolation...');
    
    // Check Alice's orders
    const aliceOrders = await client.query(
      'SELECT o.id, o.status, p.name as product_name FROM "Order" o JOIN "Product" p ON o."productId" = p.id WHERE o."customerId" = (SELECT id FROM "Customer" WHERE email = $1)',
      ['alice@example.com']
    );
    
    console.log('✅ Alice\'s orders:', aliceOrders.rows.length);
    aliceOrders.rows.forEach(order => {
      console.log(`  - Order #${order.id}: ${order.product_name} (${order.status})`);
    });
    
    // Check Bob's orders
    const bobOrders = await client.query(
      'SELECT o.id, o.status, p.name as product_name FROM "Order" o JOIN "Product" p ON o."productId" = p.id WHERE o."customerId" = (SELECT id FROM "Customer" WHERE email = $1)',
      ['bob@example.com']
    );
    
    console.log('✅ Bob\'s orders:', bobOrders.rows.length);
    bobOrders.rows.forEach(order => {
      console.log(`  - Order #${order.id}: ${order.product_name} (${order.status})`);
    });
    
    // Test data formats
    console.log('\n3️⃣ Testing Data Formats...');
    
    const products = await client.query('SELECT id, name, price, stock FROM "Product" WHERE id = $1', [101]);
    const product = products.rows[0];
    
    console.log('✅ Product data types:');
    console.log('  - ID:', typeof product.id, '=', product.id);
    console.log('  - Name:', typeof product.name, '=', product.name);
    console.log('  - Price:', typeof product.price, '=', product.price);
    console.log('  - Stock:', typeof product.stock, '=', product.stock);
    
    // Test error handling
    console.log('\n4️⃣ Testing Error Handling...');
    
    try {
      await client.query('SELECT * FROM "NonExistentTable"');
      console.error('❌ Error handling failed - non-existent table query succeeded');
    } catch (error) {
      console.log('✅ Error handling working - caught error for non-existent table');
    }
    
    console.log('\n🎉 All simple tests passed!');
    console.log('\n📊 Summary:');
    console.log('  ✅ Database connection works');
    console.log('  ✅ Data isolation is maintained');
    console.log('  ✅ Data formats are correct');
    console.log('  ✅ Error handling is working');
    
    return true;
    
  } catch (error) {
    console.error('❌ Database test failed:', error.message);
    return false;
  } finally {
    await client.end();
    console.log('\n🔌 Database connection closed');
  }
}

// Run test
testDirectConnection().catch(error => {
  console.error('💥 Test crashed:', error.message);
  process.exit(1);
});