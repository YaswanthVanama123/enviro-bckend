/**
 * Quick API Test Script for Pricing Backup System
 *
 * This script provides simple cURL commands and Postman-style tests
 * for testing the backup API endpoints manually.
 *
 * Prerequisites:
 * 1. Backend server running on http://localhost:5000
 * 2. MongoDB connected and running
 * 3. Some pricing data exists in the system
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api/pricing-backup';

class QuickAPITester {
  constructor() {
    this.results = [];
  }

  async testEndpoint(name, method, endpoint, data = null) {
    console.log(`\n🧪 Testing: ${name}`);
    console.log(`${method} ${BASE_URL}${endpoint}`);

    try {
      const config = {
        method: method.toLowerCase(),
        url: `${BASE_URL}${endpoint}`,
        headers: {
          'Content-Type': 'application/json'
        }
      };

      if (data) {
        config.data = data;
        console.log('Body:', JSON.stringify(data, null, 2));
      }

      const response = await axios(config);

      console.log(`✅ Status: ${response.status}`);
      console.log('Response:', JSON.stringify(response.data, null, 2));

      this.results.push({
        name,
        status: 'PASS',
        statusCode: response.status,
        response: response.data
      });

    } catch (error) {
      const statusCode = error.response?.status || 'ERROR';
      const errorData = error.response?.data || error.message;

      console.log(`❌ Status: ${statusCode}`);
      console.log('Error:', JSON.stringify(errorData, null, 2));

      this.results.push({
        name,
        status: 'FAIL',
        statusCode,
        error: errorData
      });
    }
  }

  async runQuickTests() {
    console.log('🚀 Quick API Tests for Pricing Backup System');
    console.log(`Base URL: ${BASE_URL}`);
    console.log('=' * 60);

    // Test 1: Health Check
    await this.testEndpoint('Health Check', 'GET', '/health');

    // Test 2: Get Statistics
    await this.testEndpoint('Get Statistics', 'GET', '/statistics');

    // Test 3: Get Backup List
    await this.testEndpoint('Get Backup List', 'GET', '/list?limit=5');

    // Test 4: Create Manual Backup
    await this.testEndpoint('Create Manual Backup', 'POST', '/create', {
      changeDescription: 'Manual test backup via API'
    });

    // Test 5: Get Updated Backup List
    await this.testEndpoint('Get Updated Backup List', 'GET', '/list?limit=5');

    // Test 6: Enforce Retention Policy
    await this.testEndpoint('Enforce Retention Policy', 'POST', '/enforce-retention');

    // Print summary
    this.printSummary();
  }

  printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 QUICK API TEST SUMMARY');
    console.log('='.repeat(60));

    const passed = this.results.filter(r => r.status === 'PASS').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;

    console.log(`\nTotal Tests: ${this.results.length}`);
    console.log(`Passed: ${passed} ✅`);
    console.log(`Failed: ${failed} ❌`);

    console.log('\nTest Details:');
    this.results.forEach((result, index) => {
      const status = result.status === 'PASS' ? '✅' : '❌';
      console.log(`  ${index + 1}. ${status} ${result.name} (${result.statusCode})`);
    });
  }
}

// Manual cURL commands for testing
function printCurlCommands() {
  console.log('\n📝 Manual cURL Commands for Testing:');
  console.log('=' * 50);

  const commands = [
    {
      name: 'Health Check',
      cmd: `curl -X GET "${BASE_URL}/health"`
    },
    {
      name: 'Get Statistics',
      cmd: `curl -X GET "${BASE_URL}/statistics"`
    },
    {
      name: 'Get Backup List',
      cmd: `curl -X GET "${BASE_URL}/list?limit=10"`
    },
    {
      name: 'Create Manual Backup',
      cmd: `curl -X POST "${BASE_URL}/create" \\
  -H "Content-Type: application/json" \\
  -d '{"changeDescription": "Manual backup via cURL"}'`
    },
    {
      name: 'Get Backup Details (replace CHANGE_DAY_ID)',
      cmd: `curl -X GET "${BASE_URL}/details/CHANGE_DAY_ID"`
    },
    {
      name: 'Get Backup Snapshot Preview (replace CHANGE_DAY_ID)',
      cmd: `curl -X GET "${BASE_URL}/snapshot/CHANGE_DAY_ID?preview=true"`
    },
    {
      name: 'Restore from Backup (replace CHANGE_DAY_ID)',
      cmd: `curl -X POST "${BASE_URL}/restore" \\
  -H "Content-Type: application/json" \\
  -d '{"changeDayId": "CHANGE_DAY_ID", "restorationNotes": "Test restoration"}'`
    },
    {
      name: 'Enforce Retention Policy',
      cmd: `curl -X POST "${BASE_URL}/enforce-retention"`
    }
  ];

  commands.forEach((cmd, index) => {
    console.log(`\n${index + 1}. ${cmd.name}:`);
    console.log(cmd.cmd);
  });
}

// Postman Collection Export
function generatePostmanCollection() {
  const collection = {
    info: {
      name: 'Pricing Backup System API',
      description: 'API collection for testing the pricing backup system',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    variable: [
      {
        key: 'baseUrl',
        value: 'http://localhost:5000/api/pricing-backup'
      }
    ],
    item: [
      {
        name: 'Health Check',
        request: {
          method: 'GET',
          header: [],
          url: {
            raw: '{{baseUrl}}/health',
            host: ['{{baseUrl}}'],
            path: ['health']
          }
        }
      },
      {
        name: 'Get Statistics',
        request: {
          method: 'GET',
          header: [],
          url: {
            raw: '{{baseUrl}}/statistics',
            host: ['{{baseUrl}}'],
            path: ['statistics']
          }
        }
      },
      {
        name: 'Get Backup List',
        request: {
          method: 'GET',
          header: [],
          url: {
            raw: '{{baseUrl}}/list?limit=10',
            host: ['{{baseUrl}}'],
            path: ['list'],
            query: [
              {
                key: 'limit',
                value: '10'
              }
            ]
          }
        }
      },
      {
        name: 'Create Manual Backup',
        request: {
          method: 'POST',
          header: [
            {
              key: 'Content-Type',
              value: 'application/json'
            }
          ],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              changeDescription: 'Manual backup created via Postman'
            }, null, 2)
          },
          url: {
            raw: '{{baseUrl}}/create',
            host: ['{{baseUrl}}'],
            path: ['create']
          }
        }
      },
      {
        name: 'Get Backup Details',
        request: {
          method: 'GET',
          header: [],
          url: {
            raw: '{{baseUrl}}/details/:changeDayId',
            host: ['{{baseUrl}}'],
            path: ['details', ':changeDayId'],
            variable: [
              {
                key: 'changeDayId',
                value: 'REPLACE_WITH_ACTUAL_ID'
              }
            ]
          }
        }
      },
      {
        name: 'Restore from Backup',
        request: {
          method: 'POST',
          header: [
            {
              key: 'Content-Type',
              value: 'application/json'
            }
          ],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              changeDayId: 'REPLACE_WITH_ACTUAL_ID',
              restorationNotes: 'Restoration via Postman'
            }, null, 2)
          },
          url: {
            raw: '{{baseUrl}}/restore',
            host: ['{{baseUrl}}'],
            path: ['restore']
          }
        }
      }
    ]
  };

  return JSON.stringify(collection, null, 2);
}

// Export functions
module.exports = {
  QuickAPITester,
  printCurlCommands,
  generatePostmanCollection
};

// Run tests if executed directly
if (require.main === module) {
  const tester = new QuickAPITester();

  // Check if --curl flag is provided
  if (process.argv.includes('--curl')) {
    printCurlCommands();
  } else if (process.argv.includes('--postman')) {
    console.log('Postman Collection JSON:');
    console.log(generatePostmanCollection());
  } else {
    // Run API tests
    tester.runQuickTests().catch(console.error);
  }
}