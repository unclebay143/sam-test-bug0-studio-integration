import { test, expect } from '@playwright/test';
import { runSteps, AssertionResult } from '@bug0/ai';

test.describe('Custom Script', () => {
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
      // ══ Main Test: Add Task ══
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
