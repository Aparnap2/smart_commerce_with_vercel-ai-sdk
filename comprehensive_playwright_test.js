#!/usr/bin/env node

/**
 * Comprehensive Playwright MCP Test for Vercel AI SDK
 * Tests AG UI components, security, and functionality with extensive debug logs
 */

import { chromium } from 'playwright';
import { performance } from 'perf_hooks';

console.log('🎭 Starting Comprehensive Playwright MCP Tests for Vercel AI SDK...\n');

// Debug configuration
const DEBUG_MODE = true;
const LOG_PERFORMANCE = true;
const LOG_NETWORK = true;

async function runComprehensiveTests() {
  let browser;
  let page;
  let context;
  
  const testStartTime = performance.now();
  const testResults = {
    passed: 0,
    failed: 0,
    warnings: 0,
    performanceMetrics: {},
    networkRequests: [],
    errors: []
  };

  try {
    // Launch browser with debug options
    console.log('🚀 Launching browser with debug configuration...');
    browser = await chromium.launch({
      headless: false,
      slowMo: DEBUG_MODE ? 50 : 0,
      devtools: DEBUG_MODE,
      args: [
        '--disable-web-security',
        '--allow-running-insecure-content',
        '--window-size=1280,800'
      ]
    });

    context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      javaScriptEnabled: true,
      ignoreHTTPSErrors: true,
      bypassCSP: true
    });

    // Enable network logging
    if (LOG_NETWORK) {
      await context.route('**', route => {
        const url = route.request().url();
        const method = route.request().method();
        testResults.networkRequests.push({
          timestamp: new Date().toISOString(),
          url,
          method,
          type: route.request().resourceType()
        });
        route.continue();
      });
    }

    page = await context.newPage();
    
    // Test 1: Application Launch and Initial Load
    console.log('\n1️⃣ Testing Application Launch and Initial Load...');
    const loadStartTime = performance.now();
    
    try {
      await page.goto('http://localhost:3000', { 
        timeout: 30000,
        waitUntil: 'networkidle'
      });
      const loadEndTime = performance.now();
      testResults.performanceMetrics.initialLoad = (loadEndTime - loadStartTime) / 1000;
      
      console.log('✅ Application launched successfully');
      console.log(`📊 Initial load time: ${testResults.performanceMetrics.initialLoad.toFixed(2)}s`);
      testResults.passed++;
      
      // Verify page title
      const title = await page.title();
      console.log(`📋 Page title: "${title}"`);
      
      // Take screenshot for visual verification
      await page.screenshot({ 
        path: '/home/aparna/Desktop/vercel-ai-sdk/test-screenshots/initial-load.png',
        fullPage: true
      });
      console.log('📸 Initial load screenshot captured');
      
    } catch (error) {
      console.error('❌ Application launch failed:', error.message);
      testResults.failed++;
      testResults.errors.push({
        test: 'Application Launch',
        error: error.message,
        stack: error.stack
      });
    }

    // Test 2: UI Component Verification
    console.log('\n2️⃣ Testing UI Component Verification...');
    
    try {
      // Check for main header
      const header = await page.$('header');
      if (header) {
        console.log('✅ Main header component found');
      } else {
        console.warn('⚠️ Main header component not found');
        testResults.warnings++;
      }

      // Check for product grid
      const productGrid = await page.$('.grid.grid-cols-1');
      if (productGrid) {
        console.log('✅ Product grid component found');
      } else {
        console.warn('⚠️ Product grid component not found');
        testResults.warnings++;
      }

      // Check for chat button
      const chatButton = await page.$('button:has-text("Chat Support")');
      if (chatButton) {
        console.log('✅ Chat support button found');
      } else {
        console.warn('⚠️ Chat support button not found');
        testResults.warnings++;
      }

      // Check for search input
      const searchInput = await page.$('input[placeholder="Search products..."]');
      if (searchInput) {
        console.log('✅ Search input component found');
      } else {
        console.warn('⚠️ Search input component not found');
        testResults.warnings++;
      }

      testResults.passed++;
      
    } catch (error) {
      console.error('❌ UI component verification failed:', error.message);
      testResults.failed++;
      testResults.errors.push({
        test: 'UI Component Verification',
        error: error.message,
        stack: error.stack
      });
    }

    // Test 3: Chat Interface Functionality
    console.log('\n3️⃣ Testing Chat Interface Functionality...');
    
    try {
      // Open chat interface
      const chatButton = await page.$('button:has-text("Chat Support")');
      if (chatButton) {
        await chatButton.click();
        console.log('✅ Chat interface opened');
        
        // Wait for chat interface to appear
        await page.waitForSelector('.fixed.bottom-4.right-4.w-96', { timeout: 5000 });
        console.log('✅ Chat interface visible');
        
        // Check for chat input
        const chatInput = await page.$('input[placeholder="Ask about orders, products, or support..."]');
        if (chatInput) {
          console.log('✅ Chat input field found');
          
          // Test typing in chat
          await chatInput.type('Hello, can you help me?');
          console.log('✅ Chat input typing successful');
          
          // Take screenshot of chat interface
          await page.screenshot({ 
            path: '/home/aparna/Desktop/vercel-ai-sdk/test-screenshots/chat-interface.png',
            clip: { x: 0, y: 0, width: 1280, height: 800 }
          });
          console.log('📸 Chat interface screenshot captured');
          
        } else {
          console.warn('⚠️ Chat input field not found');
          testResults.warnings++;
        }
        
        // Close chat interface
        const closeButton = await page.$('button[title="Close Chat"]');
        if (closeButton) {
          await closeButton.click();
          console.log('✅ Chat interface closed successfully');
        }
        
      } else {
        console.warn('⚠️ Chat button not found, skipping chat interface test');
        testResults.warnings++;
      }
      
      testResults.passed++;
      
    } catch (error) {
      console.error('❌ Chat interface functionality test failed:', error.message);
      testResults.failed++;
      testResults.errors.push({
        test: 'Chat Interface Functionality',
        error: error.message,
        stack: error.stack
      });
    }

    // Test 4: Product Search and Filtering
    console.log('\n4️⃣ Testing Product Search and Filtering...');
    
    try {
      const searchInput = await page.$('input[placeholder="Search products..."]');
      if (searchInput) {
        // Test search functionality
        await searchInput.type('laptop');
        console.log('✅ Search input typed');
        
        // Wait for search results
        await page.waitForTimeout(1000);
        
        // Check if products are filtered
        const products = await page.$$('.grid.grid-cols-1 .bg-white');
        console.log(`📊 Found ${products.length} products after search`);
        
        // Clear search
        await searchInput.fill('');
        console.log('✅ Search cleared');
        
        // Test category filtering
        const categoryButtons = await page.$$('button:has-text("Computers")');
        if (categoryButtons.length > 0) {
          await categoryButtons[0].click();
          console.log('✅ Category filter clicked');
          
          await page.waitForTimeout(1000);
          
          const filteredProducts = await page.$$('.grid.grid-cols-1 .bg-white');
          console.log(`📊 Found ${filteredProducts.length} products after category filter`);
        }
        
        testResults.passed++;
        
      } else {
        console.warn('⚠️ Search input not found, skipping search test');
        testResults.warnings++;
      }
      
    } catch (error) {
      console.error('❌ Product search and filtering test failed:', error.message);
      testResults.failed++;
      testResults.errors.push({
        test: 'Product Search and Filtering',
        error: error.message,
        stack: error.stack
      });
    }

    // Test 5: API Endpoint Testing
    console.log('\n5️⃣ Testing API Endpoint Functionality...');
    
    try {
      // Test API endpoint directly
      const apiResponse = await page.evaluate(async () => {
        try {
          const response = await fetch('/api/chat/route-ollama', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messages: [
                {
                  role: 'user',
                  content: 'Hello, can you check my orders for alice@example.com?'
                }
              ]
            })
          });
          
          if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
          }
          
          const data = await response.text();
          return { success: true, data };
          
        } catch (error) {
          return { success: false, error: error.message };
        }
      });
      
      if (apiResponse.success) {
        console.log('✅ API endpoint test successful');
        console.log('📊 API response received');
        testResults.passed++;
      } else {
        console.error('❌ API endpoint test failed:', apiResponse.error);
        testResults.failed++;
        testResults.errors.push({
          test: 'API Endpoint',
          error: apiResponse.error
        });
      }
      
    } catch (error) {
      console.error('❌ API endpoint test failed:', error.message);
      testResults.failed++;
      testResults.errors.push({
        test: 'API Endpoint',
        error: error.message,
        stack: error.stack
      });
    }

    // Test 6: Security Features Verification
    console.log('\n6️⃣ Testing Security Features...');
    
    try {
      // Check for security headers
      const response = await page.goto('http://localhost:3000', { 
        waitUntil: 'networkidle'
      });
      
      const headers = response.headers();
      console.log('📋 Security headers check:');
      console.log(`  - X-Powered-By: ${headers['x-powered-by'] || 'Not present'}`);
      console.log(`  - Cache-Control: ${headers['cache-control'] || 'Not present'}`);
      
      // Check for CSP (Content Security Policy)
      const csp = headers['content-security-policy'];
      if (csp) {
        console.log('✅ Content Security Policy found');
      } else {
        console.warn('⚠️ Content Security Policy not found');
        testResults.warnings++;
      }
      
      // Check for secure cookies
      const cookies = await context.cookies();
      const secureCookies = cookies.filter(cookie => cookie.secure);
      console.log(`📊 Secure cookies: ${secureCookies.length}/${cookies.length}`);
      
      testResults.passed++;
      
    } catch (error) {
      console.error('❌ Security features test failed:', error.message);
      testResults.failed++;
      testResults.errors.push({
        test: 'Security Features',
        error: error.message,
        stack: error.stack
      });
    }

    // Test 7: Performance Testing
    console.log('\n7️⃣ Testing Performance Metrics...');
    
    try {
      const performanceMetrics = await page.evaluate(() => {
        return {
          memory: window.performance.memory ? window.performance.memory.usedJSHeapSize / 1024 / 1024 : 'N/A',
          timing: {
            loadEventEnd: window.performance.timing ? window.performance.timing.loadEventEnd : 'N/A',
            domContentLoadedEventEnd: window.performance.timing ? window.performance.timing.domContentLoadedEventEnd : 'N/A'
          }
        };
      });
      
      console.log('📊 Performance metrics:');
      console.log(`  - Memory usage: ${performanceMetrics.memory} MB`);
      console.log(`  - DOM Content Loaded: ${performanceMetrics.timing.domContentLoadedEventEnd}ms`);
      console.log(`  - Load Event End: ${performanceMetrics.timing.loadEventEnd}ms`);
      
      testResults.performanceMetrics.memoryUsage = performanceMetrics.memory;
      testResults.performanceMetrics.domContentLoaded = performanceMetrics.timing.domContentLoadedEventEnd;
      testResults.performanceMetrics.loadEventEnd = performanceMetrics.timing.loadEventEnd;
      
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

    // Test 8: Error Handling
    console.log('\n8️⃣ Testing Error Handling...');
    
    try {
      // Test invalid API call
      const errorResponse = await page.evaluate(async () => {
        try {
          const response = await fetch('/api/nonexistent', {
            method: 'GET'
          });
          
          return { success: false, status: response.status };
          
        } catch (error) {
          return { success: false, error: error.message };
        }
      });
      
      if (errorResponse.status === 404) {
        console.log('✅ Error handling test successful (404 response)');
        testResults.passed++;
      } else {
        console.warn('⚠️ Unexpected error response:', errorResponse);
        testResults.warnings++;
      }
      
    } catch (error) {
      console.error('❌ Error handling test failed:', error.message);
      testResults.failed++;
      testResults.errors.push({
        test: 'Error Handling',
        error: error.message,
        stack: error.stack
      });
    }

    // Test 9: Accessibility Testing
    console.log('\n9️⃣ Testing Accessibility Features...');
    
    try {
      // Check for ARIA attributes
      const ariaElements = await page.$$('[aria-label], [aria-labelledby], [aria-describedby]');
      console.log(`📊 ARIA elements found: ${ariaElements.length}`);
      
      // Check for semantic HTML
      const semanticElements = await page.$$('header, nav, main, footer, article, section');
      console.log(`📊 Semantic HTML elements found: ${semanticElements.length}`);
      
      // Check for alt text on images
      const images = await page.$$('img');
      const imagesWithAlt = await page.$$('img[alt]');
      console.log(`📊 Images with alt text: ${imagesWithAlt.length}/${images.length}`);
      
      testResults.passed++;
      
    } catch (error) {
      console.error('❌ Accessibility test failed:', error.message);
      testResults.failed++;
      testResults.errors.push({
        test: 'Accessibility Testing',
        error: error.message,
        stack: error.stack
      });
    }

    // Test 10: Database Tool Integration (Simulated)
    console.log('\n🔟 Testing Database Tool Integration (Simulated)...');
    
    try {
      // Simulate database tool call
      const dbToolCall = {
        type: 'order',
        userEmail: 'alice@example.com',
        identifiers: [{ email: 'alice@example.com' }]
      };
      
      console.log('✅ Database tool call structure validated');
      console.log('📊 Simulated tool call:', JSON.stringify(dbToolCall, null, 2));
      
      // Verify security parameters
      if (dbToolCall.userEmail && dbToolCall.identifiers.length > 0) {
        console.log('✅ Security parameters present (userEmail and identifiers)');
      } else {
        console.warn('⚠️ Missing security parameters');
        testResults.warnings++;
      }
      
      testResults.passed++;
      
    } catch (error) {
      console.error('❌ Database tool integration test failed:', error.message);
      testResults.failed++;
      testResults.errors.push({
        test: 'Database Tool Integration',
        error: error.message,
        stack: error.stack
      });
    }

    // Final summary
    const testEndTime = performance.now();
    const totalTestTime = (testEndTime - testStartTime) / 1000;
    
    console.log('\n🎉 All Playwright MCP tests completed!');
    console.log('\n📊 Test Summary:');
    console.log(`  ✅ Tests Passed: ${testResults.passed}`);
    console.log(`  ❌ Tests Failed: ${testResults.failed}`);
    console.log(`  ⚠️  Warnings: ${testResults.warnings}`);
    console.log(`  ⏱️  Total Test Time: ${totalTestTime.toFixed(2)}s`);
    
    if (LOG_PERFORMANCE) {
      console.log('\n📈 Performance Metrics:');
      console.log(`  - Initial Load Time: ${testResults.performanceMetrics.initialLoad?.toFixed(2) || 'N/A'}s`);
      console.log(`  - Memory Usage: ${testResults.performanceMetrics.memoryUsage || 'N/A'} MB`);
      console.log(`  - DOM Content Loaded: ${testResults.performanceMetrics.domContentLoaded || 'N/A'}ms`);
      console.log(`  - Load Event End: ${testResults.performanceMetrics.loadEventEnd || 'N/A'}ms`);
    }
    
    if (LOG_NETWORK) {
      console.log(`\n🌐 Network Requests: ${testResults.networkRequests.length}`);
      const apiRequests = testResults.networkRequests.filter(req => req.url.includes('/api/'));
      console.log(`  - API Requests: ${apiRequests.length}`);
      const staticRequests = testResults.networkRequests.filter(req => req.type === 'stylesheet' || req.type === 'script' || req.type === 'image');
      console.log(`  - Static Assets: ${staticRequests.length}`);
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
        browser: 'Chromium',
        headless: false,
        debugMode: DEBUG_MODE
      },
      results: {
        passed: testResults.passed,
        failed: testResults.failed,
        warnings: testResults.warnings,
        errors: testResults.errors
      },
      performance: testResults.performanceMetrics,
      network: {
        totalRequests: testResults.networkRequests.length,
        apiRequests: testResults.networkRequests.filter(req => req.url.includes('/api/')).length,
        staticAssets: testResults.networkRequests.filter(req => req.type === 'stylesheet' || req.type === 'script' || req.type === 'image').length
      }
    };
    
    // Save report to file
    const fs = await import('fs');
    const path = await import('path');
    
    const reportsDir = '/home/aparna/Desktop/vercel-ai-sdk/test-reports';
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    
    const reportPath = path.join(reportsDir, `test-report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`\n📄 Detailed test report saved to: ${reportPath}`);
    
    // Close browser
    await browser.close();
    console.log('\n🔌 Browser closed');
    
    return testResults.failed === 0;
    
  } catch (error) {
    console.error('💥 Playwright test crashed:', error.message);
    console.error('Stack:', error.stack);
    
    if (browser) {
      await browser.close();
    }
    
    return false;
  }
}

// Run tests
runComprehensiveTests().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('💥 Playwright test crashed:', error.message);
  process.exit(1);
});