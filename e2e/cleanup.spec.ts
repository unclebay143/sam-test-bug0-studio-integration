import { test, expect } from '@playwright/test';
import { runSteps, AssertionResult } from '@bug0/ai';

test.describe('Cleanup', () => {
  test.describe.configure({ mode: 'parallel' });

  test.skip('Delete all tasks', async ({ page }, testInfo) => {
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });
    await page.goto('https://taskflow-env.lovable.app');
    await runSteps({
      projectId: '696615b7e55e6da5d7233eae',
      page,
      userFlow: 'Delete all tasks',
      steps: [
      // ══ Main Test: Delete all tasks ══
      {
        'description': 'Click the "Delete" button on all the task card one after the other'
      }
      ],
      bypassCache: true,
      auth: undefined,
      test,
      expect,
      assertions: [
        { assertion: `confirm there's no task card on the page` }
      ],
    });

  });
});
