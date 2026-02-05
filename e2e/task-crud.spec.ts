import { test, expect } from '@playwright/test';
import { runSteps, AssertionResult } from '@bug0/ai';

test.describe('Task CRUD', () => {
  test.describe.configure({ mode: 'parallel' });

  test.skip('Add Task', async ({ page }, testInfo) => {
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });
    await page.goto('https://taskflow-env.lovable.app');
    await runSteps({
      projectId: '696615b7e55e6da5d7233eae',
      page,
      userFlow: 'Add Task',
      steps: [
      // ══ Setup: Delete all tasks ══
      {
        'description': 'Click the "Delete" button on all the task card one after the other'
      },
      // ══ Main Test: Add Task ══
      {
        'description': 'Click "Create Task"'
      },
      {
        'description': 'Type "Buy Bread {{run.shortid}}" into "Task Title"',
        'data': { 'value': 'Buy Bread {{run.shortid}}' }
      },
      {
        'description': 'Type "Go to the store in the evening and buy bread" into "Description"',
        'data': { 'value': 'Go to the store in the evening and buy bread' }
      },
      {
        'description': 'Click "Create Task"',
        'waitUntil': 'Task created'
      },
      {
        'description': 'module from add task',
        'isScript': true,
        'script': `console.log("this is coming from a module")`
      }
      ],
      bypassCache: true,
      auth: undefined,
      test,
      expect,
      assertions: [],
    });

  });

  test.skip('Mark Task as Completed', async ({ page }, testInfo) => {
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });
    await page.goto('https://taskflow-env.lovable.app');
    await runSteps({
      projectId: '696615b7e55e6da5d7233eae',
      page,
      userFlow: 'Mark Task as Completed',
      steps: [
      // ══ Main Test: Mark Task as Completed ══
      {
        'description': 'Click "Add New Task"'
      },
      {
        'description': 'Type "Task {{run.shortid}}" into "Task Title"',
        'data': { 'value': 'Task {{run.shortid}}' }
      },
      {
        'description': 'Type "Description {{run.shortid}}" into "Description"',
        'data': { 'value': 'Description {{run.shortid}}' }
      },
      {
        'description': 'Click "Add Task"',
        'waitUntil': 'Task added successfully'
      },
      {
        'description': 'Click "Complete"',
        'waitUntil': 'Task marked as completed'
      },
      {
        'description': 'module from mark task a completed',
        'isScript': true,
        'script': `console.log("this is coming from a module")`
      }
      ],
      bypassCache: true,
      auth: undefined,
      test,
      expect,
      assertions: [],
    });

  });
});
