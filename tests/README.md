# E-Commerce Support Agent - Test Suite

Comprehensive test suite for the E-commerce Support Agent with feature tests, E2E tests, and load tests.

## Quick Start

```bash
# Install test dependencies
cd tests
npm install

# Run all tests
npm run test:all

# Generate test report
npm run test:report
```

## Test Structure

```
tests/
├── config/
│   └── test-config.js       # Docker services & test data
├── features/
│   ├── supervisor.test.js   # Intent classification & routing
│   ├── refund-agent.test.js # Stripe refund flow
│   ├── tool-agent.test.js   # Database & search operations
│   └── ui-agent.test.js     # Response formatting & SSE
├── e2e/
│   └── e2e.test.js          # Frontend + Backend E2E tests
├── load/
│   └── load-test.js         # Ollama model benchmarks
├── scripts/
│   ├── generate-report.js   # HTML/JSON report generator
│   ├── ollama-test-model.js # Individual model tests
│   └── load-test-compare.js # Model comparison tool
├── package.json
└── jest.config.js
```

## Docker Services Required

| Service | Port | Purpose |
|---------|------|---------|
| PostgreSQL | 5432 | Database tests |
| Redis | 6379 | Checkpoint tests |
| Ollama | 11434 | LLM performance tests |

Start with:
```bash
docker compose up -d postgres redis ollama
```

## Running Tests

### Feature Tests
```bash
npm run test:feature          # All feature tests
npm run test:feature -- --testNamePattern="Supervisor"
npm run test:feature -- --testNamePattern="RefundAgent"
```

### E2E Tests
```bash
npm run test:e2e              # All E2E tests
npm run test:e2e -- --testNamePattern="Backend"
npm run test:e2e -- --testNamePattern="Frontend"
```

### Load Tests
```bash
npm run test:load             # All load tests
npm run loadtest:qwen        # Benchmark qwen2.5-coder:3b
npm run loadtest:granite     # Benchmark granite3.1-moe:3b
npm run loadtest:compare     # Compare both models
```

### Ollama Scripts
```bash
npm run ollama:test-model     # Test Ollama connection & models
npm run ollama:embed          # Test embedding generation
```

## Test Configuration

Edit `config/test-config.js` to modify:

- Docker service URLs
- Test user accounts
- Test order data
- Environment variables

## Generated Reports

Reports are saved to `test-reports/`:

- `test-report-[timestamp].html` - Visual HTML report
- `test-report-[timestamp].json` - JSON data for CI/CD

Logs are saved to `test-logs/` and `load-test-logs/`.

## Environment Variables

```env
# Docker services (defaults configured)
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
REDIS_HOST=localhost
REDIS_PORT=6379
OLLAMA_URL=http://localhost:11434

# Test data
TEST_CUSTOMER_EMAIL=testcustomer@example.com
TEST_ADMIN_EMAIL=testadmin@example.com

# App URL
APP_URL=http://localhost:3000
```

## Adding New Tests

### Feature Test Example
```javascript
describe('Feature: New Feature', () => {
  it('should do something', async () => {
    const result = await myAgent.doSomething();
    expect(result.success).toBe(true);
  });
});
```

### E2E Test Example
```javascript
it('should complete user flow', async () => {
  await page.goto('/dashboard');
  await page.click('[data-test="chat-button"]');
  await page.fill('textarea', 'Help me');
  await page.press('textarea', 'Enter');
  // Verify response...
});
```

## CI/CD Integration

Add to your CI pipeline:

```yaml
- name: Run tests
  run: |
    cd tests
    npm install
    npm run test:all
    npm run test:report
    # Upload test-reports/ as artifacts
```

## Troubleshooting

### Tests hang
- Check Docker services are running: `docker ps`
- Verify port availability
- Check test timeouts in `jest.config.js`

### Database connection fails
- Ensure PostgreSQL Docker is running
- Check connection string in `test-config.js`

### E2E tests fail
- Ensure app is running: `npm run dev`
- Check browser console for errors
- Verify Playwright browsers installed
