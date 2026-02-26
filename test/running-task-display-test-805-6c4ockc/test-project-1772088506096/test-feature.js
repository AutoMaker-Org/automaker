/**
 * Test Feature Implementation
 *
 * This file demonstrates a simple test feature implementation
 * for validating the Automaker system workflow.
 */

class TestFeature {
  constructor(name = 'Test Feature') {
    this.name = name;
    this.status = 'running';
    this.createdAt = new Date().toISOString();
  }

  /**
   * Execute the test feature
   * @returns {Object} Execution result
   */
  execute() {
    console.log(`Executing ${this.name}...`);

    const result = {
      success: true,
      message: 'Test feature executed successfully',
      timestamp: new Date().toISOString(),
      feature: this.name,
    };

    this.status = 'completed';
    return result;
  }

  /**
   * Get feature status
   * @returns {string} Current status
   */
  getStatus() {
    return this.status;
  }

  /**
   * Get feature info
   * @returns {Object} Feature information
   */
  getInfo() {
    return {
      name: this.name,
      status: this.status,
      createdAt: this.createdAt,
    };
  }
}

// Export for use in tests
module.exports = TestFeature;

// Example usage
if (require.main === module) {
  const feature = new TestFeature();
  const result = feature.execute();
  console.log(JSON.stringify(result, null, 2));
}
