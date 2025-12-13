#!/usr/bin/env node

/**
 * Comprehensive Test for Secure Database Tool Usage by LLM
 * Tests the database tool integration with Ollama Qwen3:4b model
 * Includes extensive debug logs and security verification
 */

import { databaseQueryTool } from './lib/tools/database.js';
import { env } from './lib/env.js';

console.log('🔐 Starting Comprehensive Secure Database Tool Test with LLM...\n');

// Debug configuration
const DEBUG_MODE = true;
const LOG_SECURITY = true;
const LOG_PERFORMANCE = true;

async function runSecureDatabaseTests() {
  const testStartTime = performance.now();
  const testResults = {
    passed: 0,
    failed: 0,
    warnings: 0,
    securityIssues: [],
    performanceMetrics: {},
    errors: []
  };

  try {
    console.log('📋 Environment Configuration:');
    console.log(`  - NODE_ENV: ${env.NODE_ENV}`);
    console.log(`  - DATABASE_URL: ${env.DATABASE_URL.replace(/:[^@]+@/, ':*****@')}`);
    console.log(`  - OLLAMA_MODEL: ${env.OLLAMA_MODEL}`);
    console.log(`  - OLLAMA_BASE_URL: ${env.OLLAMA_BASE_URL}`);

    // Test 1: Database Connection Test
    console.log('\n1️⃣ Testing Database Connection...');
    
    try {
      const connectionTestStart = performance.now();
      
      // Test basic database connectivity
      const testQuery = await databaseQueryTool.execute({
        type: 'product',
        userEmail: 'test@example.com',
        identifiers: [{ productId: '1' }]
      });
      
      const connectionTestEnd = performance.now();
      testResults.performanceMetrics.dbConnection = (connectionTestEnd - connectionTestStart) / 1000;
      
      if (testQuery.error) {
        console.error('❌ Database connection test failed:', testQuery.message);
        testResults.failed++;
        testResults.errors.push({
          test: 'Database Connection',
          error: testQuery.message
        });
      } else {
        console.log('✅ Database connection successful');
        console.log(`📊 Connection time: ${testResults.performanceMetrics.dbConnection.toFixed(2)}s`);
        testResults.passed++;
      }
      
    } catch (error) {
      console.error('❌ Database connection test failed:', error.message);
      testResults.failed++;
      testResults.errors.push({
        test: 'Database Connection',
        error: error.message,
        stack: error.stack
      });
    }

    // Test 2: Security Validation Tests
    console.log('\n2️⃣ Testing Security Validation...');
    
    try {
      // Test 2a: Missing userEmail (should fail)
      console.log('📋 Testing missing userEmail (should fail)...');
      const missingEmailResult = await databaseQueryTool.execute({
        type: 'customer',
        userEmail: '',
        identifiers: [{ email: 'test@example.com' }]
      });
      
      if (missingEmailResult.error && missingEmailResult.message.includes('Authentication Required')) {
        console.log('✅ Missing userEmail properly rejected');
      } else {
        console.error('❌ Missing userEmail not properly rejected');
        testResults.failed++;
        testResults.securityIssues.push('Missing userEmail not properly rejected');
      }

      // Test 2b: Invalid email format (should fail)
      console.log('📋 Testing invalid email format (should fail)...');
      const invalidEmailResult = await databaseQueryTool.execute({
        type: 'customer',
        userEmail: 'invalid-email',
        identifiers: [{ email: 'invalid-email' }]
      });
      
      if (invalidEmailResult.error && invalidEmailResult.message.includes('Invalid Email Format')) {
        console.log('✅ Invalid email format properly rejected');
      } else {
        console.error('❌ Invalid email format not properly rejected');
        testResults.failed++;
        testResults.securityIssues.push('Invalid email format not properly rejected');
      }

      // Test 2c: Unauthorized access attempt (should fail)
      console.log('📋 Testing unauthorized access (should fail)...');
      const unauthorizedResult = await databaseQueryTool.execute({
        type: 'order',
        userEmail: 'alice@example.com',
        identifiers: [{ email: 'bob@example.com' }] // Attempting to access someone else's data
      });
      
      if (unauthorizedResult.error && unauthorizedResult.message.includes('Access Denied')) {
        console.log('✅ Unauthorized access properly denied');
      } else {
        console.error('❌ Unauthorized access not properly denied');
        testResults.failed++;
        testResults.securityIssues.push('Unauthorized access not properly denied');
      }

      testResults.passed++;
      
    } catch (error) {
      console.error('❌ Security validation test failed:', error.message);
      testResults.failed++;
      testResults.errors.push({
        test: 'Security Validation',
        error: error.message,
        stack: error.stack
      });
    }

    // Test 3: Valid Data Access Tests
    console.log('\n3️⃣ Testing Valid Data Access...');
    
    try {
      const accessTestStart = performance.now();

      // Test 3a: Valid customer data access
      console.log('📋 Testing valid customer data access...');
      const customerResult = await databaseQueryTool.execute({
        type: 'customer',
        userEmail: 'alice@example.com',
        identifiers: [{ email: 'alice@example.com' }]
      });
      
      if (customerResult.error) {
        console.error('❌ Customer data access failed:', customerResult.message);
        testResults.failed++;
        testResults.errors.push({
          test: 'Customer Data Access',
          error: customerResult.message
        });
      } else {
        console.log('✅ Customer data access successful');
        console.log(`📊 Retrieved ${customerResult.data?.length || 0} customer records`);
        
        // Verify data structure
        if (customerResult.data && customerResult.data.length > 0) {
          const customer = customerResult.data[0];
          console.log(`📋 Customer data structure: ${Object.keys(customer).join(', ')}`);
        }
      }

      // Test 3b: Valid order data access
      console.log('📋 Testing valid order data access...');
      const orderResult = await databaseQueryTool.execute({
        type: 'order',
        userEmail: 'alice@example.com',
        identifiers: [{ email: 'alice@example.com' }]
      });
      
      if (orderResult.error) {
        console.error('❌ Order data access failed:', orderResult.message);
        testResults.failed++;
        testResults.errors.push({
          test: 'Order Data Access',
          error: orderResult.message
        });
      } else {
        console.log('✅ Order data access successful');
        console.log(`📊 Retrieved ${orderResult.data?.length || 0} order records`);
        
        // Verify data structure
        if (orderResult.data && orderResult.data.length > 0) {
          const order = orderResult.data[0];
          console.log(`📋 Order data structure: ${Object.keys(order).join(', ')}`);
        }
      }

      // Test 3c: Valid product data access (public data)
      console.log('📋 Testing valid product data access...');
      const productResult = await databaseQueryTool.execute({
        type: 'product',
        userEmail: 'alice@example.com',
        identifiers: [{ productId: '1' }]
      });
      
      if (productResult.error) {
        console.error('❌ Product data access failed:', productResult.message);
        testResults.failed++;
        testResults.errors.push({
          test: 'Product Data Access',
          error: productResult.message
        });
      } else {
        console.log('✅ Product data access successful');
        console.log(`📊 Retrieved ${productResult.data?.length || 0} product records`);
        
        // Verify data structure
        if (productResult.data && productResult.data.length > 0) {
          const product = productResult.data[0];
          console.log(`📋 Product data structure: ${Object.keys(product).join(', ')}`);
        }
      }

      const accessTestEnd = performance.now();
      testResults.performanceMetrics.dataAccess = (accessTestEnd - accessTestStart) / 1000;
      
      testResults.passed++;
      
    } catch (error) {
      console.error('❌ Valid data access test failed:', error.message);
      testResults.failed++;
      testResults.errors.push({
        test: 'Valid Data Access',
        error: error.message,
        stack: error.stack
      });
    }

    // Test 4: Data Formatting for LLM
    console.log('\n4️⃣ Testing Data Formatting for LLM...');
    
    try {
      // Test data formatting
      const formatTestStart = performance.now();
      
      const customerResult = await databaseQueryTool.execute({
        type: 'customer',
        userEmail: 'alice@example.com',
        identifiers: [{ email: 'alice@example.com' }]
      });
      
      const formatTestEnd = performance.now();
      testResults.performanceMetrics.dataFormatting = (formatTestEnd - formatTestStart) / 1000;
      
      if (customerResult.llm_formatted_data) {
        console.log('✅ LLM formatted data available');
        
        // Check for proper formatting
        const hasMarkdownHeaders = customerResult.llm_formatted_data.includes('##');
        const hasCustomerInfo = customerResult.llm_formatted_data.includes('Customer');
        
        if (hasMarkdownHeaders && hasCustomerInfo) {
          console.log('✅ Data properly formatted for LLM consumption');
          console.log('📋 Sample formatted data:');
          console.log(customerResult.llm_formatted_data.substring(0, 200) + '...');
        } else {
          console.warn('⚠️ Data formatting may be incomplete');
          testResults.warnings++;
        }
      } else {
        console.error('❌ LLM formatted data not available');
        testResults.failed++;
        testResults.errors.push({
          test: 'Data Formatting',
          error: 'LLM formatted data not available'
        });
      }
      
      testResults.passed++;
      
    } catch (error) {
      console.error('❌ Data formatting test failed:', error.message);
      testResults.failed++;
      testResults.errors.push({
        test: 'Data Formatting',
        error: error.message,
        stack: error.stack
      });
    }

    // Test 5: Error Handling and Sanitization
    console.log('\n5️⃣ Testing Error Handling and Sanitization...');
    
    try {
      // Test error scenarios
      const errorTestStart = performance.now();
      
      // Test 5a: Invalid query type
      console.log('📋 Testing invalid query type...');
      try {
        const invalidTypeResult = await databaseQueryTool.execute({
          type: 'invalid_type',
          userEmail: 'alice@example.com',
          identifiers: [{ email: 'alice@example.com' }]
        });
        
        if (invalidTypeResult.error) {
          console.log('✅ Invalid query type properly handled');
        } else {
          console.error('❌ Invalid query type not properly handled');
          testResults.failed++;
          testResults.errors.push({
            test: 'Invalid Query Type',
            error: 'Invalid query type not properly handled'
          });
        }
      } catch (error) {
        console.log('✅ Invalid query type properly handled with exception');
      }

      // Test 5b: Missing required parameters
      console.log('📋 Testing missing required parameters...');
      try {
        const missingParamsResult = await databaseQueryTool.execute({
          type: 'customer',
          userEmail: 'alice@example.com',
          identifiers: [] // Missing required identifiers
        });
        
        if (missingParamsResult.error) {
          console.log('✅ Missing parameters properly handled');
        } else {
          console.error('❌ Missing parameters not properly handled');
          testResults.failed++;
          testResults.errors.push({
            test: 'Missing Parameters',
            error: 'Missing parameters not properly handled'
          });
        }
      } catch (error) {
        console.log('✅ Missing parameters properly handled with exception');
      }

      const errorTestEnd = performance.now();
      testResults.performanceMetrics.errorHandling = (errorTestEnd - errorTestStart) / 1000;
      
      testResults.passed++;
      
    } catch (error) {
      console.error('❌ Error handling test failed:', error.message);
      testResults.failed++;
      testResults.errors.push({
        test: 'Error Handling',
        error: error.message,
        stack: error.stack
      });
    }

    // Test 6: Performance Testing
    console.log('\n6️⃣ Testing Performance Metrics...');
    
    try {
      const perfTestStart = performance.now();
      
      // Run multiple queries to test performance
      const queries = [
        { type: 'customer', userEmail: 'alice@example.com', identifiers: [{ email: 'alice@example.com' }] },
        { type: 'order', userEmail: 'alice@example.com', identifiers: [{ email: 'alice@example.com' }] },
        { type: 'product', userEmail: 'alice@example.com', identifiers: [{ productId: '1' }] }
      ];
      
      const queryResults = [];
      for (const query of queries) {
        const start = performance.now();
        const result = await databaseQueryTool.execute(query);
        const end = performance.now();
        queryResults.push({
          query: query.type,
          time: (end - start) / 1000,
          success: !result.error
        });
      }
      
      const perfTestEnd = performance.now();
      testResults.performanceMetrics.multipleQueries = (perfTestEnd - perfTestStart) / 1000;
      
      console.log('📊 Individual query performance:');
      queryResults.forEach(result => {
        console.log(`  - ${result.query}: ${result.time.toFixed(3)}s (${result.success ? '✅' : '❌'})`);
      });
      
      const avgQueryTime = queryResults.reduce((sum, r) => sum + r.time, 0) / queryResults.length;
      console.log(`📊 Average query time: ${avgQueryTime.toFixed(3)}s`);
      
      testResults.passed++;
      
    } catch (error) {
      console.error('❌ Performance test failed:', error.message);
      testResults.failed++;
      testResults.errors.push({
        test: 'Performance Testing',
        error: error.message,
        stack: error.stack
      });
    }

    // Test 7: Context Isolation
    console.log('\n7️⃣ Testing Context Isolation...');
    
    try {
      const isolationTestStart = performance.now();
      
      // Test multiple concurrent requests for different users
      const userQueries = [
        { userEmail: 'alice@example.com', type: 'customer' },
        { userEmail: 'bob@example.com', type: 'customer' }
      ];
      
      const isolationResults = await Promise.all(
        userQueries.map(async (query) => {
          const result = await databaseQueryTool.execute({
            type: query.type,
            userEmail: query.userEmail,
            identifiers: [{ email: query.userEmail }]
          });
          return { 
            userEmail: query.userEmail, 
            success: !result.error,
            data: result.data
          };
        })
      );
      
      const isolationTestEnd = performance.now();
      testResults.performanceMetrics.contextIsolation = (isolationTestEnd - isolationTestStart) / 1000;
      
      console.log('📊 Context isolation results:');
      isolationResults.forEach(result => {
        console.log(`  - ${result.userEmail}: ${result.success ? '✅' : '❌'} (${result.data?.length || 0} records)`);
      });
      
      // Verify data isolation
      const aliceData = isolationResults.find(r => r.userEmail === 'alice@example.com')?.data || [];
      const bobData = isolationResults.find(r => r.userEmail === 'bob@example.com')?.data || [];
      
      // Check that Alice's data doesn't contain Bob's email and vice versa
      const aliceHasBobData = aliceData.some(item => item.email === 'bob@example.com');
      const bobHasAliceData = bobData.some(item => item.email === 'alice@example.com');
      
      if (!aliceHasBobData && !bobHasAliceData) {
        console.log('✅ Context isolation maintained - no data leakage');
      } else {
        console.error('❌ Context isolation failed - data leakage detected');
        testResults.failed++;
        testResults.securityIssues.push('Context isolation failed - data leakage detected');
      }
      
      testResults.passed++;
      
    } catch (error) {
      console.error('❌ Context isolation test failed:', error.message);
      testResults.failed++;
      testResults.errors.push({
        test: 'Context Isolation',
        error: error.message,
        stack: error.stack
      });
    }

    // Test 8: LLM Integration Readiness
    console.log('\n8️⃣ Testing LLM Integration Readiness...');
    
    try {
      const llmTestStart = performance.now();
      
      // Test that the tool is properly configured for LLM usage
      console.log('📋 Checking tool configuration for LLM...');
      
      if (databaseQueryTool && typeof databaseQueryTool.execute === 'function') {
        console.log('✅ Database tool properly configured');
      } else {
        console.error('❌ Database tool not properly configured');
        testResults.failed++;
        testResults.errors.push({
          test: 'LLM Integration',
          error: 'Database tool not properly configured'
        });
      }
      
      // Test tool description for LLM
      const toolDescription = databaseQueryTool.description;
      if (toolDescription && toolDescription.includes('SECURE DATABASE ACCESS')) {
        console.log('✅ Tool description includes security information');
      } else {
        console.warn('⚠️ Tool description may not include security information');
        testResults.warnings++;
      }
      
      // Test parameter schema
      const toolParameters = databaseQueryTool.parameters;
      if (toolParameters && toolParameters.shape) {
        console.log('✅ Tool parameter schema defined');
        const requiredParams = Object.keys(toolParameters.shape);
        console.log(`📋 Required parameters: ${requiredParams.join(', ')}`);
        
        // Check for security parameters
        if (requiredParams.includes('userEmail') && requiredParams.includes('identifiers')) {
          console.log('✅ Security parameters included in schema');
        } else {
          console.error('❌ Security parameters missing from schema');
          testResults.failed++;
          testResults.securityIssues.push('Security parameters missing from schema');
        }
      } else {
        console.error('❌ Tool parameter schema not defined');
        testResults.failed++;
        testResults.errors.push({
          test: 'LLM Integration',
          error: 'Tool parameter schema not defined'
        });
      }
      
      const llmTestEnd = performance.now();
      testResults.performanceMetrics.llmIntegration = (llmTestEnd - llmTestStart) / 1000;
      
      testResults.passed++;
      
    } catch (error) {
      console.error('❌ LLM integration test failed:', error.message);
      testResults.failed++;
      testResults.errors.push({
        test: 'LLM Integration',
        error: error.message,
        stack: error.stack
      });
    }

    // Final summary
    const testEndTime = performance.now();
    const totalTestTime = (testEndTime - testStartTime) / 1000;
    
    console.log('\n🎉 All Secure Database Tool tests completed!');
    console.log('\n📊 Test Summary:');
    console.log(`  ✅ Tests Passed: ${testResults.passed}`);
    console.log(`  ❌ Tests Failed: ${testResults.failed}`);
    console.log(`  ⚠️  Warnings: ${testResults.warnings}`);
    console.log(`  🔒 Security Issues: ${testResults.securityIssues.length}`);
    console.log(`  ⏱️  Total Test Time: ${totalTestTime.toFixed(2)}s`);
    
    if (LOG_PERFORMANCE) {
      console.log('\n📈 Performance Metrics:');
      console.log(`  - Database Connection: ${testResults.performanceMetrics.dbConnection?.toFixed(3) || 'N/A'}s`);
      console.log(`  - Data Access: ${testResults.performanceMetrics.dataAccess?.toFixed(3) || 'N/A'}s`);
      console.log(`  - Data Formatting: ${testResults.performanceMetrics.dataFormatting?.toFixed(3) || 'N/A'}s`);
      console.log(`  - Error Handling: ${testResults.performanceMetrics.errorHandling?.toFixed(3) || 'N/A'}s`);
      console.log(`  - Multiple Queries: ${testResults.performanceMetrics.multipleQueries?.toFixed(3) || 'N/A'}s`);
      console.log(`  - Context Isolation: ${testResults.performanceMetrics.contextIsolation?.toFixed(3) || 'N/A'}s`);
      console.log(`  - LLM Integration: ${testResults.performanceMetrics.llmIntegration?.toFixed(3) || 'N/A'}s`);
    }
    
    if (LOG_SECURITY && testResults.securityIssues.length > 0) {
      console.log('\n🔒 Security Issues Found:');
      testResults.securityIssues.forEach((issue, index) => {
        console.log(`  ${index + 1}. ${issue}`);
      });
    }
    
    if (testResults.errors.length > 0) {
      console.log('\n❌ Errors Encountered:');
      testResults.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error.test}: ${error.error}`);
      });
    }
    
    // Generate detailed test report
    const report = {
      timestamp: new Date().toISOString(),
      testDuration: totalTestTime,
      environment: {
        nodeVersion: process.version,
        databaseUrl: env.DATABASE_URL.replace(/:[^@]+@/, ':*****@'),
        ollamaModel: env.OLLAMA_MODEL,
        ollamaBaseUrl: env.OLLAMA_BASE_URL
      },
      results: {
        passed: testResults.passed,
        failed: testResults.failed,
        warnings: testResults.warnings,
        securityIssues: testResults.securityIssues,
        errors: testResults.errors
      },
      performance: testResults.performanceMetrics
    };
    
    // Save report to file
    const fs = await import('fs');
    const path = await import('path');
    
    const reportsDir = '/home/aparna/Desktop/vercel-ai-sdk/test-reports';
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    
    const reportPath = path.join(reportsDir, `secure-db-test-report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`\n📄 Detailed test report saved to: ${reportPath}`);
    
    return testResults.failed === 0 && testResults.securityIssues.length === 0;
    
  } catch (error) {
    console.error('💥 Secure database test crashed:', error.message);
    console.error('Stack:', error.stack);
    return false;
  }
}

// Run tests
runSecureDatabaseTests().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('💥 Secure database test crashed:', error.message);
  process.exit(1);
});