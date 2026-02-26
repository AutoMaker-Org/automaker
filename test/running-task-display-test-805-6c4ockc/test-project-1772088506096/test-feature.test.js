/**
 * Test Feature Unit Tests
 *
 * Simple tests to verify the test feature implementation
 */

const TestFeature = require('./test-feature');

function runTests() {
  let passed = 0;
  let failed = 0;

  console.log('Running Test Feature Tests...\n');

  // Test 1: Feature creation
  try {
    const feature = new TestFeature('Test Feature');
    if (feature.name === 'Test Feature' && feature.status === 'running') {
      console.log('✓ Test 1: Feature creation - PASSED');
      passed++;
    } else {
      console.log('✗ Test 1: Feature creation - FAILED');
      failed++;
    }
  } catch (error) {
    console.log('✗ Test 1: Feature creation - FAILED:', error.message);
    failed++;
  }

  // Test 2: Feature execution
  try {
    const feature = new TestFeature();
    const result = feature.execute();
    if (result.success === true && feature.status === 'completed') {
      console.log('✓ Test 2: Feature execution - PASSED');
      passed++;
    } else {
      console.log('✗ Test 2: Feature execution - FAILED');
      failed++;
    }
  } catch (error) {
    console.log('✗ Test 2: Feature execution - FAILED:', error.message);
    failed++;
  }

  // Test 3: Get status
  try {
    const feature = new TestFeature();
    const status = feature.getStatus();
    if (status === 'running') {
      console.log('✓ Test 3: Get status - PASSED');
      passed++;
    } else {
      console.log('✗ Test 3: Get status - FAILED');
      failed++;
    }
  } catch (error) {
    console.log('✗ Test 3: Get status - FAILED:', error.message);
    failed++;
  }

  // Test 4: Get info
  try {
    const feature = new TestFeature('My Test Feature');
    const info = feature.getInfo();
    if (info.name === 'My Test Feature' && info.status === 'running' && info.createdAt) {
      console.log('✓ Test 4: Get info - PASSED');
      passed++;
    } else {
      console.log('✗ Test 4: Get info - FAILED');
      failed++;
    }
  } catch (error) {
    console.log('✗ Test 4: Get info - FAILED:', error.message);
    failed++;
  }

  console.log(`\nTest Results: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

// Run tests
if (require.main === module) {
  const success = runTests();
  process.exit(success ? 0 : 1);
}

module.exports = { runTests };
