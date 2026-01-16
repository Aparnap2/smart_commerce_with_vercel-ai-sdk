/**
 * Test Report Generator
 * Aggregates results from feature, E2E, and load tests
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';

class TestReportGenerator {
  constructor() {
    this.timestamp = new Date().toISOString();
    this.reports = {
      feature: null,
      e2e: null,
      load: null
    };
    this.outputDir = resolve('./test-reports');
  }

  async generate() {
    console.log('Generating test report...');
    mkdirSync(this.outputDir, { recursive: true });

    // Load coverage data if available
    const coverage = this.loadCoverage();

    // Load test results
    this.loadTestResults();

    // Generate report
    const report = this.createReport(coverage);

    // Save report
    const filepath = join(this.outputDir, `test-report-${Date.now()}.html`);
    this.saveHtmlReport(report, filepath);

    // Save JSON summary
    const jsonPath = join(this.outputDir, `test-report-${Date.now()}.json`);
    writeFileSync(jsonPath, JSON.stringify(report, null, 2));

    console.log(`Report generated: ${filepath}`);
    return report;
  }

  loadCoverage() {
    const coveragePath = join(this.outputDir, 'coverage', 'coverage-summary.json');
    if (existsSync(coveragePath)) {
      try {
        return JSON.parse(readFileSync(coveragePath, 'utf-8'));
      } catch {
        return null;
      }
    }
    return null;
  }

  loadTestResults() {
    const resultsDir = join(this.outputDir, 'results');

    for (const type of ['feature', 'e2e', 'load']) {
      const file = join(resultsDir, `${type}-results.json`);
      if (existsSync(file)) {
        try {
          this.reports[type] = JSON.parse(readFileSync(file, 'utf-8'));
        } catch {
          this.reports[type] = null;
        }
      }
    }
  }

  createReport(coverage) {
    return {
      title: 'E-Commerce Support Agent - Test Report',
      timestamp: this.timestamp,
      summary: this.generateSummary(coverage),
      featureTests: this.reports.feature,
      e2eTests: this.reports.e2e,
      loadTests: this.reports.load,
      coverage,
      recommendations: this.generateRecommendations()
    };
  }

  generateSummary(coverage) {
    const summary = {
      totalTests: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      duration: '0s'
    };

    // Aggregate from all test types
    for (const [type, report] of Object.entries(this.reports)) {
      if (report?.summary) {
        summary.totalTests += report.summary.tests || 0;
        summary.passed += report.summary.passed || 0;
        summary.failed += report.summary.failed || 0;
        summary.skipped += report.summary.skipped || 0;
      }
    }

    summary.passRate = summary.totalTests > 0
      ? ((summary.passed / summary.totalTests) * 100).toFixed(2)
      : '0';

    return summary;
  }

  generateRecommendations() {
    const recommendations = [];

    // Coverage recommendations
    if (!this.reports.feature) {
      recommendations.push({
        type: 'coverage',
        priority: 'high',
        message: 'Feature test results not found. Run npm run test:feature'
      });
    }

    // Performance recommendations
    if (this.reports.load) {
      const latency = this.reports.load.metrics?.latency;
      if (latency?.avg > 2000) {
        recommendations.push({
          type: 'performance',
          priority: 'medium',
          message: 'Average response latency exceeds 2 seconds. Consider model optimization.'
        });
      }
    }

    // E2E recommendations
    if (!this.reports.e2e) {
      recommendations.push({
        type: 'testing',
        priority: 'medium',
        message: 'E2E tests not run. Ensure Playwright is installed and Docker is running.'
      });
    }

    return recommendations;
  }

  saveHtmlReport(report, filepath) {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${report.title}</title>
  <style>
    :root {
      --primary: #2563eb;
      --success: #16a34a;
      --warning: #ca8a04;
      --danger: #dc2626;
      --bg: #f8fafc;
      --card: #ffffff;
      --text: #1e293b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: var(--bg); color: var(--text); padding: 2rem; }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { color: var(--primary); margin-bottom: 0.5rem; }
    .subtitle { color: #64748b; margin-bottom: 2rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem; margin-bottom: 2rem; }
    .card { background: var(--card); border-radius: 0.5rem; padding: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .card h3 { font-size: 0.875rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
    .card .value { font-size: 2rem; font-weight: bold; margin-top: 0.5rem; }
    .card .value.success { color: var(--success); }
    .card .value.warning { color: var(--warning); }
    .card .value.danger { color: var(--danger); }
    .section { background: var(--card); border-radius: 0.5rem; padding: 1.5rem; margin-bottom: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .section h2 { font-size: 1.25rem; margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 1px solid #e2e8f0; }
    .metric { display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid #f1f5f9; }
    .metric:last-child { border-bottom: none; }
    .status-badge { display: inline-block; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
    .status-badge.pass { background: #dcfce7; color: #166534; }
    .status-badge.fail { background: #fee2e2; color: #991b1b; }
    .status-badge.skip { background: #fef9c3; color: #854d0e; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 0.75rem; border-bottom: 1px solid #e2e8f0; }
    th { font-weight: 600; color: #64748b; font-size: 0.875rem; }
    .recommendation { padding: 1rem; background: #f8fafc; border-left: 4px solid var(--warning); margin-bottom: 0.5rem; }
    .recommendation.high { border-left-color: var(--danger); }
    .recommendation.medium { border-left-color: var(--warning); }
    .recommendation.low { border-left-color: var(--success); }
  </style>
</head>
<body>
  <div class="container">
    <h1>${report.title}</h1>
    <p class="subtitle">Generated: ${report.timestamp}</p>

    <div class="grid">
      <div class="card">
        <h3>Total Tests</h3>
        <div class="value">${report.summary.totalTests}</div>
      </div>
      <div class="card">
        <h3>Passed</h3>
        <div class="value success">${report.summary.passed}</div>
      </div>
      <div class="card">
        <h3>Failed</h3>
        <div class="value ${report.summary.failed > 0 ? 'danger' : ''}">${report.summary.failed}</div>
      </div>
      <div class="card">
        <h3>Pass Rate</h3>
        <div class="value ${report.summary.passRate > 80 ? 'success' : report.summary.passRate > 50 ? 'warning' : 'danger'}">${report.summary.passRate}%</div>
      </div>
    </div>

    ${report.featureTests ? `
    <div class="section">
      <h2>Feature Tests</h2>
      <table>
        <thead>
          <tr><th>Test Suite</th><th>Tests</th><th>Passed</th><th>Failed</th><th>Status</th></tr>
        </thead>
        <tbody>
          ${this.renderFeatureTests(report.featureTests)}
        </tbody>
      </table>
    </div>
    ` : ''}

    ${report.e2eTests ? `
    <div class="section">
      <h2>E2E Tests</h2>
      <table>
        <thead>
          <tr><th>Test Suite</th><th>Tests</th><th>Passed</th><th>Failed</th><th>Status</th></tr>
        </thead>
        <tbody>
          ${this.renderE2ETests(report.e2eTests)}
        </tbody>
      </table>
    </div>
    ` : ''}

    ${report.loadTests ? `
    <div class="section">
      <h2>Load Tests</h2>
      <table>
        <thead>
          <tr><th>Metric</th><th>Min</th><th>Avg</th><th>P95</th><th>Max</th></tr>
        </thead>
        <tbody>
          ${this.renderLoadTests(report.loadTests)}
        </tbody>
      </table>
    </div>
    ` : ''}

    ${report.recommendations.length > 0 ? `
    <div class="section">
      <h2>Recommendations</h2>
      ${report.recommendations.map(r => `
        <div class="recommendation ${r.priority}">
          <strong>${r.type.toUpperCase()}</strong>: ${r.message}
        </div>
      `).join('')}
    </div>
    ` : ''}

    ${report.coverage ? `
    <div class="section">
      <h2>Code Coverage</h2>
      <table>
        <thead>
          <tr><th>File</th><th>Coverage</th><th>Lines</th></tr>
        </thead>
        <tbody>
          ${this.renderCoverage(report.coverage)}
        </tbody>
      </table>
    </div>
    ` : ''}
  </div>
</body>
</html>
    `;

    writeFileSync(filepath, html);
  }

  renderFeatureTests(featureTests) {
    return Object.entries(featureTests.suites || {}).map(([name, suite]) => `
      <tr>
        <td>${name}</td>
        <td>${suite.tests || 0}</td>
        <td>${suite.passed || 0}</td>
        <td>${suite.failed || 0}</td>
        <td><span class="status-badge ${suite.failed > 0 ? 'fail' : 'pass'}">${suite.failed > 0 ? 'FAIL' : 'PASS'}</span></td>
      </tr>
    `).join('');
  }

  renderE2ETests(e2eTests) {
    return Object.entries(e2eTests.suites || {}).map(([name, suite]) => `
      <tr>
        <td>${name}</td>
        <td>${suite.tests || 0}</td>
        <td>${suite.passed || 0}</td>
        <td>${suite.failed || 0}</td>
        <td><span class="status-badge ${suite.failed > 0 ? 'fail' : 'pass'}">${suite.failed > 0 ? 'FAIL' : 'PASS'}</span></td>
      </tr>
    `).join('');
  }

  renderLoadTests(loadTests) {
    return Object.entries(loadTests.metrics || {}).map(([name, stats]) => `
      <tr>
        <td>${name}</td>
        <td>${stats.min?.toFixed(2) || 0}ms</td>
        <td>${stats.avg?.toFixed(2) || 0}ms</td>
        <td>${stats.p95?.toFixed(2) || 0}ms</td>
        <td>${stats.max?.toFixed(2) || 0}ms</td>
      </tr>
    `).join('');
  }

  renderCoverage(coverage) {
    if (!coverage.data) return '<tr><td colspan="3">No coverage data available</td></tr>';

    return Object.entries(coverage.data).map(([file, stats]) => `
      <tr>
        <td>${file}</td>
        <td>${(stats.covered / stats.total * 100).toFixed(1)}%</td>
        <td>${stats.covered}/${stats.total}</td>
      </tr>
    `).join('');
  }
}

// Run if called directly
generateReport().catch(console.error);

export default TestReportGenerator;
