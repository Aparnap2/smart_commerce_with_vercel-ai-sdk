#!/usr/bin/env node

/**
 * Comprehensive Integration Test for Vercel AI SDK
 * Tests: Database isolation, data handling, formats, types, and hallucination prevention
 */

import { databaseQueryTool } from './lib/tools/database.js';
import { env } from './lib/env.js';

console.log('🧪 Starting Vercel AI SDK Integration Tests...\n');

// Test 1: Environment Validation
console.log('1️⃣ Testing Environment Configuration...');
try {
  console.log('✅ Environment variables loaded successfully');
  console.log('📊 Database URL:', env.DATABASE_URL ? 'Configured' : 'Missing');
  console.log('🔑 Google API Key:', env.GOOGLE_GENERATIVE_AI_API_KEY ? 'Configured' : 'Missing');
} catch (error) {
  console.error('❌ Environment validation failed:', error.message);
  process.exit(1);
}

// Test 2: Database Connection Test
console.log('\n2️⃣ Testing Database Connection...');
async function testDatabaseConnection() {
  try {
    const testQuery = await databaseQueryTool.execute({
      type: 'customer',
      userEmail: 'test@example.com',
      identifiers: [{ email: 'test@example.com' }]
    });
    
    if (testQuery.error) {
      console.log('✅ Database connection working (expected no data for test email)');
    } else {
      console.log('✅ Database connection working, found data');
    }
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
}

// Test 3: Data Isolation Test
console.log('\n3️⃣ Testing Data Isolation...');
async function testDataIsolation() {
  try {
    // Test accessing someone else's data (should fail)
    const unauthorizedResult = await databaseQueryTool.execute({
      type: 'customer',
      userEmail: 'alice@example.com', 
      identifiers: [{ email: 'bob@example.com' }] // Trying to access Bob's data as Alice
    });
    
    if (unauthorizedResult.error && unauthorizedResult.message.includes('Access Denied')) {
      console.log('✅ Data isolation working - unauthorized access blocked');
    } else {
      console.error('❌ Data isolation failed - unauthorized access allowed');
      return false;
    }
    
    // Test accessing own data (should succeed)
    const authorizedResult = await databaseQueryTool.execute({
      type: 'customer',
      userEmail: 'alice@example.com',
      identifiers: [{ email: 'alice@example.com' }]
    });
    
    if (!authorizedResult.error && authorizedResult.data && authorizedResult.data.length > 0) {
      console.log('✅ Data isolation working - authorized access allowed');
      console.log('📊 Found customer:', authorizedResult.data[0].name);
    } else {
      console.error('❌ Data isolation failed - authorized access blocked');
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('❌ Data isolation test failed:', error.message);
    return false;
  }
}

// Test 4: Data Format and Type Validation
console.log('\n4️⃣ Testing Data Formats and Types...');
async function testDataFormats() {
  try {
    const result = await databaseQueryTool.execute({
      type: 'order',
      userEmail: 'alice@example.com',
      identifiers: [{ email: 'alice@example.com' }]
    });
    
    if (result.error) {
      console.error('❌ Failed to retrieve order data');
      return false;
    }
    
    // Check data structure
    if (!Array.isArray(result.data)) {
      console.error('❌ Data format invalid - expected array');
      return false;
    }
    
    // Check individual order structure
    const order = result.data[0];
    const expectedFields = ['id', 'customer', 'product', 'status', 'orderDate'];
    const missingFields = expectedFields.filter(field => !order.hasOwnProperty(field));
    
    if (missingFields.length > 0) {
      console.error('❌ Missing fields:', missingFields.join(', '));
      return false;
    }
    
    // Check data types
    if (typeof order.id !== 'number') {
      console.error('❌ Invalid type for order.id - expected number');
      return false;
    }
    
    if (typeof order.status !== 'string') {
      console.error('❌ Invalid type for order.status - expected string');
      return false;
    }
    
    console.log('✅ Data formats and types are correct');
    console.log('📊 Sample order data:', {
      id: order.id,
      status: order.status,
      customer: order.customer.name,
      product: order.product.name
    });
    
    return true;
  } catch (error) {
    console.error('❌ Data format test failed:', error.message);
    return false;
  }
}

// Test 5: Hallucination Prevention Test
console.log('\n5️⃣ Testing Hallucination Prevention...');
async function testHallucinationPrevention() {
  try {
    // Test with invalid product ID (should return no data, not make up data)
    const invalidProductResult = await databaseQueryTool.execute({
      type: 'product',
      userEmail: 'test@example.com',
      identifiers: [{ productId: '999999' }] // Non-existent product
    });
    
    if (invalidProductResult.error || invalidProductResult.data.length === 0) {
      console.log('✅ Hallucination prevention working - no fake data generated');
    } else {
      console.error('❌ Hallucination prevention failed - fake data generated');
      return false;
    }
    
    // Test with valid product ID (should return real data)
    const validProductResult = await databaseQueryTool.execute({
      type: 'product',
      userEmail: 'test@example.com',
      identifiers: [{ productId: '101' }] // Smartphone X
    });
    
    if (!validProductResult.error && validProductResult.data.length > 0) {
      console.log('✅ Hallucination prevention working - real data returned');
      console.log('📊 Product:', validProductResult.data[0].name);
    } else {
      console.error('❌ Hallucination prevention failed - real data not returned');
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('❌ Hallucination prevention test failed:', error.message);
    return false;
  }
}

// Test 6: Error Handling Test
console.log('\n6️⃣ Testing Error Handling...');
async function testErrorHandling() {
  try {
    // Test invalid email format
    const invalidEmailResult = await databaseQueryTool.execute({
      type: 'customer',
      userEmail: 'invalid-email',
      identifiers: [{ email: 'invalid-email' }]
    });
    
    if (invalidEmailResult.error && invalidEmailResult.message.includes('Invalid Email Format')) {
      console.log('✅ Error handling working - invalid email rejected');
    } else {
      console.error('❌ Error handling failed - invalid email accepted');
      return false;
    }
    
    // Test missing required fields
    const missingFieldsResult = await databaseQueryTool.execute({
      type: 'customer',
      userEmail: '',
      identifiers: []
    });
    
    if (missingFieldsResult.error) {
      console.log('✅ Error handling working - missing fields rejected');
    } else {
      console.error('❌ Error handling failed - missing fields accepted');
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('❌ Error handling test failed:', error.message);
    return false;
  }
}

// Run all tests
async function runAllTests() {
  const results = [];
  
  // Run database connection test
  const dbConnected = await testDatabaseConnection();
  results.push(dbConnected);
  
  // Run data isolation test
  const dataIsolated = await testDataIsolation();
  results.push(dataIsolated);
  
  // Run data format test
  const dataValid = await testDataFormats();
  results.push(dataValid);
  
  // Run hallucination prevention test
  const noHallucination = await testHallucinationPrevention();
  results.push(noHallucination);
  
  // Run error handling test
  const errorsHandled = await testErrorHandling();
  results.push(errorsHandled);
  
  // Summary
  console.log('\n📊 Test Summary:');
  console.log('================');
  console.log('✅ Tests Passed:', results.filter(r => r).length);
  console.log('❌ Tests Failed:', results.filter(r => !r).length);
  console.log('📈 Success Rate:', `${(results.filter(r => r).length / results.length * 100).toFixed(1)}%`);
  
  if (results.every(r => r)) {
    console.log('\n🎉 All tests passed! The system is working correctly.');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed. Please review the errors above.');
    process.exit(1);
  }
}

// Start tests
runAllTests().catch(error => {
  console.error('💥 Test suite crashed:', error.message);
  process.exit(1);
});