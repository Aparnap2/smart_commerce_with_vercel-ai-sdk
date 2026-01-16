/**
 * Docker Services Configuration for Tests
 * All tests connect to these Docker containers
 */

export const dockerServices = {
  postgres: {
    host: 'localhost',
    port: 5432,
    database: 'vercel_ai',
    user: 'vercel_user',
    password: 'vercel_pass',
    uri: 'postgresql://vercel_user:vercel_pass@localhost:5432/vercel_ai'
  },
  redis: {
    host: 'localhost',
    port: 6379,
    uri: 'redis://localhost:6379'
  },
  ollama: {
    baseUrl: 'http://localhost:11434',
    models: {
      chat: 'qwen2.5-coder:3b',
      embed: 'nomic-embed-text:v1.5',
      alternative: 'granite3.1-moe:3b'
    }
  },
  app: {
    baseUrl: 'http://localhost:3000'
  }
};

export const testUsers = {
  customer: {
    id: 'test-customer-001',
    email: 'testcustomer@example.com',
    name: 'Test Customer'
  },
  admin: {
    id: 'test-admin-001',
    email: 'testadmin@example.com',
    name: 'Test Admin'
  }
};

export const testOrders = {
  eligible: {
    id: 1001,
    paymentIntentId: 'pi_test_eligible_001',
    amount: 9999, // $99.99 in cents
    currency: 'usd',
    daysAgo: 5,
    status: 'delivered'
  },
  ineligible: {
    id: 1002,
    paymentIntentId: 'pi_test_ineligible_001',
    amount: 5000,
    currency: 'usd',
    daysAgo: 45, // Outside 30-day window
    status: 'delivered'
  }
};
