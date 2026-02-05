import { logTestExecution } from "./execution-log";

/**
 * Realtime reporter for Playwright tests
 * Logs test execution events to MongoDB instead of Axiom
 */
export default class RealtimeReporter {
  private projectId: string;
  private executionId: string;

  constructor() {
    this.projectId = process.env.projectId!;
    this.executionId = process.env.executionId!;

    if (!this.projectId) {
      throw new Error(
        "projectId environment variable is required for RealtimeReporter"
      );
    }
    if (!this.executionId) {
      throw new Error(
        "executionId environment variable is required for RealtimeReporter"
      );
    }
    console.log(
      `RealtimeReporter initialized for Project: ${this.projectId}, Execution: ${this.executionId}`
    );
  }

  async onBegin(_: any, suite: any) {
    // Log test suite start
    try {
      await logTestExecution({
        projectId: this.projectId,
        executionId: this.executionId,
        timestamp: new Date().toISOString(),
        event: "logs-test-suite-start",
        message: `🚀 Starting the test run with ${
          suite.allTests().length
        } tests.`,
        totalTestsCount: suite.allTests().length,
      });
    } catch (error) {
      console.error("Failed to log test suite start:", error);
    }
  }

  async onTestEnd(test: any, result: any) {
    // Log individual test result
    const status = result.status;

    try {
      await logTestExecution({
        projectId: this.projectId,
        executionId: this.executionId,
        timestamp: new Date().toISOString(),
        event: "logs-test-end",
        message: `[${status.toUpperCase()}] ${test.title}`,
        testTitle: test.title,
        testStatus: status,
      });
    } catch (error) {
      console.error("Failed to log test end:", error);
    }
  }

  async onEnd(result: any) {
    // Log test suite end
    try {
      await logTestExecution({
        projectId: this.projectId,
        executionId: this.executionId,
        timestamp: new Date().toISOString(),
        event: "logs-test-suite-end",
        message: `\n✅ All tests finished: ${result.status.toUpperCase()}`,
      });
    } catch (error) {
      console.error("Failed to log test suite end:", error);
    }
  }
}
