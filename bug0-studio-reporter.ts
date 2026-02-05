import mongoose from "mongoose";
import { connectToDatabase } from "./mongodb";
import fs from "fs/promises";
import path from "path";
import type {
  Reporter,
  FullConfig,
  Suite,
  TestCase,
  TestResult,
  FullResult,
  TestStep,
} from "@playwright/test/reporter";

/**
 * Bug0 Studio Reporter for Playwright
 *
 * Saves complete test execution data to MongoDB for Bug0 Studio.
 * This reporter works alongside the existing realtime-reporter.ts
 *
 * Usage in playwright.config.js:
 * reporter: [
 *   ['html'],
 *   ['./realtime-reporter.ts'],
 *   ['./bug0-studio-reporter.ts']  // Add this line
 * ]
 */
// Regex pattern to match retry video files with testId (video-<testIdShort>-retry-N.webm)
const RETRY_VIDEO_PATTERN = /^video-[a-f0-9]{8}-retry-\d+\.webm$/;

export default class Bug0StudioReporter implements Reporter {
  private projectId?: string;
  private executionId: string;
  private testRunId?: mongoose.Types.ObjectId;
  private suiteIdMap: Map<string, mongoose.Types.ObjectId> = new Map();
  private specIdMap: Map<string, mongoose.Types.ObjectId> = new Map();
  private isConnected: boolean = false;
  private pendingOperations: Promise<void>[] = [];
  private onBeginPromise: Promise<void> | null = null;

  constructor() {
    this.projectId = process.env.projectId;
    this.executionId = process.env.executionId || `exec-${Date.now()}`;
  }

  /**
   * Called once before running tests
   * Creates TestRun and Suite hierarchy
   */
  async onBegin(config: FullConfig, suite: Suite) {
    this.onBeginPromise = this.processOnBegin(config, suite);
    await this.onBeginPromise;
  }

  private async processOnBegin(config: FullConfig, suite: Suite) {
    try {
      await this.ensureConnection();

      const testRunsCollection = mongoose.connection.db!.collection("testruns");

      const testRunDoc = {
        projectName: this.projectId || "Unknown",
        projectId: this.projectId
          ? new mongoose.Types.ObjectId(this.projectId)
          : undefined,
        executionId: this.executionId,
        startTime: new Date(),
        duration: 0,
        totalTests: suite.allTests().length,
        passed: 0,
        failed: 0,
        flaky: 0,
        skipped: 0,
        timedOut: 0,
        interrupted: 0,
        environment: (process.env.NODE_ENV === "production"
          ? "production"
          : "development") as any,
        status: "running" as any,
        gitCommitSha: process.env.gitCommitSha,
        gitBranch: process.env.gitBranch || "main",
        reportUrl: process.env.reportUrl,
        shardIndex: process.env.shardIndex
          ? parseInt(process.env.shardIndex)
          : undefined,
        shardTotal: process.env.shardCount
          ? parseInt(process.env.shardCount)
          : undefined,
        ciProvider: process.env.CI ? "github-actions" : undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await testRunsCollection.insertOne(testRunDoc);
      this.testRunId = result.insertedId as mongoose.Types.ObjectId;

      console.log(
        `[Bug0StudioReporter] Initialized for Project: ${this.projectId}, Execution: ${this.executionId}`,
      );

      // Create suite hierarchy
      await this.processSuiteHierarchy(suite, null, 0);
    } catch (error) {
      console.error("[Bug0StudioReporter] Failed to initialize:", error);
      throw error;
    }
  }

  /**
   * Called when a test begins
   * Creates Spec document (or reuses existing one for retries)
   */
  async onTestBegin(test: TestCase, result: TestResult) {
    try {
      // Wait for onBegin to complete before proceeding
      if (this.onBeginPromise) {
        await this.onBeginPromise;
      }

      await this.ensureConnection();

      // Check in-memory map first - handles retries correctly
      // test.id is stable across retry attempts within the same run
      if (this.specIdMap.has(test.id)) {
        console.log(
          `[Bug0StudioReporter] Reusing existing spec for retry: ${test.title}`,
        );
        return;
      }

      // Guard against edge case where onBegin failed
      if (!this.testRunId) {
        console.error(
          `[Bug0StudioReporter] testRunId not set, cannot create spec for: ${test.title}`,
        );
        return;
      }

      const specsCollection = mongoose.connection.db!.collection("specs");

      // Get or create suite on-demand (handles race condition)
      const suiteId = await this.getOrCreateSuiteForTest(test.parent);

      if (!suiteId) {
        console.error(
          `[Bug0StudioReporter] Failed to get/create suite for test: ${test.title}`,
        );
        return;
      }

      const specDoc = {
        suiteId: suiteId,
        runId: this.testRunId,
        title: test.title,
        fullTitle: test.titlePath().join(" › "),
        location: {
          file: test.location.file,
          line: test.location.line,
          column: test.location.column,
        },
        testId: test.id,
        tags: test.tags,
        annotations: test.annotations.map((a) => ({
          type: a.type,
          description: a.description,
        })),
        expectedStatus: test.expectedStatus,
        timeout: test.timeout,
        retries: test.retries,
        finalStatus: "passed",
        totalDuration: 0,
        attempts: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const res = await specsCollection.insertOne(specDoc);
      this.specIdMap.set(test.id, res.insertedId as mongoose.Types.ObjectId);
    } catch (error) {
      console.error("[Bug0StudioReporter] Failed to create spec:", error);
    }
  }

  /**
   * Called when a test ends
   * Saves TestResult with error details and attachments
   */
  async onTestEnd(test: TestCase, result: TestResult) {
    const operation = this.processTestEnd(test, result);
    this.pendingOperations.push(operation);
    await operation;
  }

  private async processTestEnd(test: TestCase, result: TestResult) {
    try {
      await this.ensureConnection();

      const specId = this.specIdMap.get(test.id);
      if (!specId) return;

      const testResultsCollection =
        mongoose.connection.db!.collection("testresults");

      const testResultDoc = {
        specId: specId,
        runId: this.testRunId,
        retryAttempt: result.retry,
        status: result.status,
        duration: result.duration,
        startTime: result.startTime,
        error: result.error
          ? {
              message: result.error.message || "",
              stack: result.error.stack,
              snippet: (result.error as any).snippet,
              location: (result.error as any).location,
            }
          : undefined,
        workerIndex: result.workerIndex,
        parallelIndex: result.parallelIndex,
        project: {
          name: test.parent.project()?.name || "default",
        },
        steps: this.mapSteps(result.steps, result.startTime),
        stdout: result.stdout.map((chunk) => chunk.toString()),
        stderr: result.stderr.map((chunk) => chunk.toString()),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const res = await testResultsCollection.insertOne(testResultDoc);
      const testResultId = res.insertedId as mongoose.Types.ObjectId;

      // Save attachments
      for (const attachment of result.attachments) {
        await this.saveAttachment(
          attachment,
          testResultId,
          specId,
          result.retry,
          test.id, // Pass testId for unique retry video names
        );
      }

      // Update Spec with final status
      await this.updateSpecAfterTest(specId);
    } catch (error) {
      console.error("[Bug0StudioReporter] Failed to save test result:", error);
    }
  }

  /**
   * Called when the entire test run ends
   * Updates TestRun with final statistics
   */
  async onEnd(result: FullResult) {
    try {
      // Wait for all pending test result operations to complete
      await Promise.all(this.pendingOperations);

      await this.ensureConnection();

      if (!this.testRunId) return;

      const specsCollection = mongoose.connection.db!.collection("specs");
      const specs = await specsCollection
        .find({ runId: this.testRunId })
        .toArray();

      console.log(
        `[Bug0StudioReporter] Found ${specs.length} specs for runId: ${this.testRunId}`,
      );

      const stats = {
        totalTests: specs.length,
        passed: specs.filter((s: any) => s.finalStatus === "passed").length,
        failed: specs.filter((s: any) => s.finalStatus === "failed").length,
        flaky: specs.filter((s: any) => s.finalStatus === "flaky").length,
        skipped: specs.filter((s: any) => s.finalStatus === "skipped").length,
        timedOut: specs.filter((s: any) => s.finalStatus === "timedOut").length,
        interrupted: specs.filter((s: any) => s.finalStatus === "interrupted")
          .length,
      };

      let finalStatus: string = "passed";
      if (stats.failed > 0) finalStatus = "failed";
      else if (stats.timedOut > 0) finalStatus = "timedOut";
      else if (stats.interrupted > 0) finalStatus = "interrupted";

      // Calculate total test duration (sum of all spec durations including retries)
      const totalTestDuration = specs.reduce(
        (sum: number, spec: any) => sum + (spec.totalDuration || 0),
        0,
      );

      const testRunsCollection = mongoose.connection.db!.collection("testruns");
      const startTime = await this.getTestRunStartTime();

      const updateResult = await testRunsCollection.updateOne(
        { _id: this.testRunId },
        {
          $set: {
            ...stats,
            status: finalStatus,
            endTime: new Date(),
            duration: Date.now() - startTime, // Wall-clock time
            totalTestDuration: totalTestDuration, // Sum of all test execution times
            updatedAt: new Date(),
          },
        },
      );

      console.log(
        `[Bug0StudioReporter] Update result - matched: ${updateResult.matchedCount}, modified: ${updateResult.modifiedCount}`,
      );
      console.log(`[Bug0StudioReporter] Test run completed: ${finalStatus}`);
      console.log(
        `[Bug0StudioReporter] Stats - Passed: ${stats.passed}/${stats.totalTests}, Failed: ${stats.failed}, Flaky: ${stats.flaky}`,
      );
      console.log(
        `[Bug0StudioReporter] Duration - Wall-clock: ${Date.now() - startTime}ms, Total test time: ${totalTestDuration}ms`,
      );

      // Update suite durations by aggregating child spec durations
      await this.updateSuiteDurations();
    } catch (error) {
      console.error("[Bug0StudioReporter] Failed to finalize:", error);
    }
  }

  // ==================== Helper Methods ====================

  private async ensureConnection() {
    if (!this.isConnected) {
      await connectToDatabase();
      this.isConnected = true;
    }
  }

  /**
   * Get or create suite for a test, traversing hierarchy on-demand
   * This handles the race condition where onTestBegin is called before onBegin completes
   */
  private async getOrCreateSuiteForTest(
    suite: Suite,
  ): Promise<mongoose.Types.ObjectId | null> {
    if (!suite || !suite.title || suite.title.trim() === "") {
      return null;
    }

    const suiteKey = this.getSuiteKey(suite);

    // Check cache first
    const cachedId = this.suiteIdMap.get(suiteKey);
    if (cachedId) {
      return cachedId;
    }

    // Not in cache - need to create it (and parent hierarchy if needed)
    // First, ensure parent exists
    let parentSuiteId: mongoose.Types.ObjectId | null = null;
    if (
      suite.parent &&
      suite.parent.title &&
      suite.parent.title.trim() !== ""
    ) {
      parentSuiteId = await this.getOrCreateSuiteForTest(suite.parent);
    }

    // Now create this suite
    const suitesCollection = mongoose.connection.db!.collection("suites");

    const suiteDoc = {
      runId: this.testRunId,
      parentSuiteId: parentSuiteId,
      title: suite.title,
      filePath: suite.location?.file || "",
      location: suite.location
        ? {
            file: suite.location.file,
            line: suite.location.line,
            column: suite.location.column,
          }
        : undefined,
      suiteType: suite.location?.file ? "file" : "describe",
      order: 0, // Will be updated if needed
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      flakyTests: 0,
      skippedTests: 0,
      duration: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await suitesCollection.insertOne(suiteDoc);
    const suiteId = result.insertedId as mongoose.Types.ObjectId;

    // Cache it
    this.suiteIdMap.set(suiteKey, suiteId);

    return suiteId;
  }

  private async processSuiteHierarchy(
    suite: Suite,
    parentSuiteId: mongoose.Types.ObjectId | null,
    order: number,
  ): Promise<void> {
    if (!suite.title || suite.title.trim() === "") {
      for (let i = 0; i < suite.suites.length; i++) {
        await this.processSuiteHierarchy(suite.suites[i], parentSuiteId, i);
      }
      return;
    }

    const suitesCollection = mongoose.connection.db!.collection("suites");

    const suiteDoc = {
      runId: this.testRunId,
      parentSuiteId: parentSuiteId,
      title: suite.title,
      filePath: suite.location?.file || "",
      location: suite.location
        ? {
            file: suite.location.file,
            line: suite.location.line,
            column: suite.location.column,
          }
        : undefined,
      suiteType: suite.location?.file ? "file" : "describe",
      order: order,
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      flakyTests: 0,
      skippedTests: 0,
      duration: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await suitesCollection.insertOne(suiteDoc);
    const suiteId = result.insertedId as mongoose.Types.ObjectId;

    const suiteKey = this.getSuiteKey(suite);
    this.suiteIdMap.set(suiteKey, suiteId);

    for (let i = 0; i < suite.suites.length; i++) {
      await this.processSuiteHierarchy(suite.suites[i], suiteId, i);
    }
  }

  private getSuiteKey(suite: Suite): string {
    const path = [];
    let current: Suite | undefined = suite;
    while (current && current.title) {
      path.unshift(current.title);
      current = current.parent;
    }
    return path.join("›");
  }

  private mapSteps(steps: TestStep[], testStartTime: Date): any[] {
    return steps.map((step) => {
      // Calculate video timestamp (seconds from test start)
      // Video recording starts when the test begins, so we calculate offset
      const videoTimestamp = step.startTime
        ? (step.startTime.getTime() - testStartTime.getTime()) / 1000
        : 0;

      return {
        title: step.title,
        category: step.category,
        startTime: step.startTime,
        duration: step.duration,
        videoTimestamp: Math.max(0, videoTimestamp), // Ensure non-negative
        error: step.error
          ? {
              message: step.error.message || "",
              stack: step.error.stack,
            }
          : undefined,
        steps: step.steps
          ? this.mapSteps(step.steps, testStartTime)
          : undefined,
      };
    });
  }

  private async saveAttachment(
    attachment: any,
    testResultId: mongoose.Types.ObjectId,
    specId: mongoose.Types.ObjectId,
    retryAttempt: number,
    testId: string, // Added parameter for unique retry video names
  ) {
    const attachmentsCollection =
      mongoose.connection.db!.collection("attachments");

    const attachmentType = this.determineAttachmentType(
      attachment.name,
      attachment.contentType,
    );

    // Handle different attachment types:
    // - Small text logs: store body as text
    // - Large binary files (screenshots/videos/traces): store filename only
    let bodyContent: string | undefined;
    let filePath = "";

    if (attachmentType === "log" && attachment.body) {
      // For logs, store the text content
      bodyContent = attachment.body.toString("utf-8");
    } else if (attachment.path) {
      // For binary files, extract filename from path
      const fileName = attachment.path.split("/").pop();

      // For retry videos, copy with retry suffix to preserve them
      // Playwright deletes previous retry videos, so we need to copy them immediately
      if (attachmentType === "video" && retryAttempt > 0) {
        try {
          const originalPath = attachment.path;
          const videoExtension = path.extname(fileName);
          const videoBaseName = path.basename(fileName, videoExtension);
          const videoDirectory = path.dirname(originalPath);
          // Include first 8 chars of testId to make retry videos unique per test
          const testIdShort = testId.substring(0, 8);
          const newFileName = `${videoBaseName}-${testIdShort}-retry-${retryAttempt}${videoExtension}`;
          const newPath = path.join(videoDirectory, newFileName);

          // Copy the video file asynchronously
          await fs.copyFile(originalPath, newPath);

          filePath = newFileName;
          console.log(
            `[Bug0StudioReporter] Copied video for retry ${retryAttempt}: ${newFileName}`,
          );
        } catch (error) {
          console.error(
            `[Bug0StudioReporter] Failed to copy video for retry ${retryAttempt}:`,
            error,
          );
          filePath = fileName; // Fall back to original filename
        }
      } else {
        // For non-video files or first attempt, use original filename
        filePath = fileName;
      }
    }

    const attachmentDoc = {
      resultId: testResultId,
      specId: specId,
      runId: this.testRunId,
      name: attachment.name,
      contentType: attachment.contentType,
      path: filePath,
      body: bodyContent,
      attachmentType: attachmentType,
      capturedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await attachmentsCollection.insertOne(attachmentDoc);
  }

  private determineAttachmentType(name: string, contentType: string): string {
    const nameLower = name.toLowerCase();
    if (nameLower.includes("screenshot") || contentType.startsWith("image/"))
      return "screenshot";
    if (nameLower.includes("video") || contentType.startsWith("video/"))
      return "video";
    if (nameLower.includes("trace") || contentType.includes("zip"))
      return "trace";
    if (nameLower.includes("diff")) return "diff";
    if (contentType.startsWith("text/")) return "log";
    return "other";
  }

  private async updateSpecAfterTest(specId: mongoose.Types.ObjectId) {
    const specsCollection = mongoose.connection.db!.collection("specs");
    const testResultsCollection =
      mongoose.connection.db!.collection("testresults");

    const results = await testResultsCollection
      .find({ specId })
      .sort({ retryAttempt: 1 })
      .toArray();

    let finalStatus = "passed";
    if (results.length > 0) {
      const lastResult: any = results[results.length - 1];

      if (lastResult.status === "passed") {
        const hasPreviousFailure = results
          .slice(0, -1)
          .some((r: any) => r.status === "failed" || r.status === "timedOut");
        finalStatus = hasPreviousFailure ? "flaky" : "passed";
      } else {
        finalStatus = lastResult.status;
      }
    }

    const totalDuration = results.reduce(
      (sum: number, r: any) => sum + r.duration,
      0,
    );

    await specsCollection.updateOne(
      { _id: specId },
      {
        $set: {
          finalStatus,
          totalDuration,
          attempts: results.length,
          updatedAt: new Date(),
        },
      },
    );
  }

  private async getTestRunStartTime(): Promise<number> {
    if (!this.testRunId) return Date.now();

    const testRunsCollection = mongoose.connection.db!.collection("testruns");
    const testRun = await testRunsCollection.findOne({ _id: this.testRunId });

    return testRun?.startTime?.getTime() || Date.now();
  }

  /**
   * Update suite durations by aggregating child spec durations
   * Called at the end of the test run
   */
  private async updateSuiteDurations() {
    try {
      const suitesCollection = mongoose.connection.db!.collection("suites");
      const specsCollection = mongoose.connection.db!.collection("specs");

      // Get all suites for this run
      const suites = await suitesCollection
        .find({ runId: this.testRunId })
        .toArray();

      if (suites.length === 0) {
        return;
      }

      // Fetch all specs for all suites in a single query (avoids N+1 problem)
      const suiteIds = suites.map((s) => s._id);
      const allSpecs = await specsCollection
        .find({
          suiteId: { $in: suiteIds },
        })
        .toArray();

      // Group specs by suiteId in memory
      const specsBySuiteId = new Map<string, any[]>();
      for (const spec of allSpecs) {
        const suiteIdStr = spec.suiteId.toString();
        if (!specsBySuiteId.has(suiteIdStr)) {
          specsBySuiteId.set(suiteIdStr, []);
        }
        specsBySuiteId.get(suiteIdStr)!.push(spec);
      }

      // Prepare bulk update operations
      const bulkOps = [];
      for (const suite of suites) {
        const suiteIdStr = suite._id.toString();
        const specs = specsBySuiteId.get(suiteIdStr) || [];

        // Calculate total duration and test counts
        const totalDuration = specs.reduce(
          (sum: number, spec: any) => sum + (spec.totalDuration || 0),
          0,
        );
        const totalTests = specs.length;
        const passedTests = specs.filter(
          (s: any) => s.finalStatus === "passed",
        ).length;
        const failedTests = specs.filter(
          (s: any) => s.finalStatus === "failed",
        ).length;
        const flakyTests = specs.filter(
          (s: any) => s.finalStatus === "flaky",
        ).length;
        const skippedTests = specs.filter(
          (s: any) => s.finalStatus === "skipped",
        ).length;

        bulkOps.push({
          updateOne: {
            filter: { _id: suite._id },
            update: {
              $set: {
                duration: totalDuration,
                totalTests: totalTests,
                passedTests: passedTests,
                failedTests: failedTests,
                flakyTests: flakyTests,
                skippedTests: skippedTests,
                updatedAt: new Date(),
              },
            },
          },
        });
      }

      // Execute all updates in a single bulk operation
      if (bulkOps.length > 0) {
        await suitesCollection.bulkWrite(bulkOps);
      }

      console.log(
        `[Bug0StudioReporter] Updated durations for ${suites.length} suites`,
      );
    } catch (error) {
      console.error(
        "[Bug0StudioReporter] Failed to update suite durations:",
        error,
      );
    }
  }
}
