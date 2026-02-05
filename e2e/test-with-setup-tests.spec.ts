import { test, expect } from '@playwright/test';
import { runSteps, AssertionResult } from '@bug0/ai';

test.describe('Test with Setup tests', () => {
  test.describe.configure({ mode: 'parallel' });

  test('Mark Task as Completed', async ({ page }, testInfo) => {
    test.setTimeout(840000);
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });
    await page.goto('https://taskflow-env.lovable.app');
    await runSteps({
      projectId: '696615b7e55e6da5d7233eae',
      page,
      userFlow: 'Mark Task as Completed',
      steps: [
      // ══ Setup: Delete all tasks ══
      {
        'description': 'Click the "Delete" button on all the task card one after the other'
      },
      // ══ Setup: Add Task ══
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
      },
      // ══ Setup: Add Task ══
      {
        'description': 'Module',
        'isScript': true,
        'script': `console.log("this is coming from a module")`
      },
      {
        'description': 'Add New Task',
        'data': { 'value': 's' },
        'isScript': true,
        'script': `  await page.getByRole('button', { name: 'Add New Task' }).click();
  await page.getByRole('textbox', { name: 'Task Title *' }).fill('Buy Milk');
  await page.getByRole('textbox', { name: 'Description (optional)' }).fill('Buy milk in the evening time after work');
  await page.getByRole('button', { name: 'Create Task' }).click();
  await expect(page.getByRole('main')).toContainText('Buy Milk');`
      },
      // ══ Main Test: Mark Task as Completed ══
      {
        'description': 'Click "Complete" from "Task {{run.shortid}}"',
        'waitUntil': 'Task marked as completed'
      }
      ],
      bypassCache: true,
      auth: undefined,
      test,
      expect,
      assertions: [],
    });

  });

  test('Empty published field', async ({ page }, testInfo) => {
    test.setTimeout(300000);
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });
    await page.goto('https://taskflow-env.lovable.app');
    await runSteps({
      projectId: '696615b7e55e6da5d7233eae',
      page,
      userFlow: 'Empty published field',
      steps: [

      ],
      bypassCache: true,
      auth: undefined,
      test,
      expect,
      assertions: [],
    });

  });
});
