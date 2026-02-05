import mongoose from "mongoose";
import { connectToDatabase } from "./mongodb";

interface TestExecutionLogData {
  projectId: string;
  executionId: string;
  timestamp: string;
  event: "logs-test-suite-start" | "logs-test-end" | "logs-test-suite-end";
  message: string;
  totalTestsCount?: number;
  testTitle?: string;
  testStatus?: string;
}

/**
 * Logs a test execution event to MongoDB
 * This replaces the Axiom logging functionality
 */
export async function logTestExecution(
  data: TestExecutionLogData
): Promise<void> {
  await connectToDatabase();

  const logsCollection =
    mongoose.connection.db!.collection("testexecutionlogs");

  const logEntry = {
    projectId: new mongoose.Types.ObjectId(data.projectId),
    executionId: data.executionId,
    timestamp: new Date(data.timestamp),
    event: data.event,
    message: data.message,
    ...(data.totalTestsCount !== undefined && {
      totalTestsCount: data.totalTestsCount,
    }),
    ...(data.testTitle && { testTitle: data.testTitle }),
    ...(data.testStatus && { testStatus: data.testStatus }),
    createdAt: new Date(),
  };

  await logsCollection.insertOne(logEntry);
}
