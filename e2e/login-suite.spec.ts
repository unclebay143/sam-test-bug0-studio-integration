import { test, expect } from '@playwright/test';
import { runSteps, AssertionResult } from '@bug0/ai';

test.describe('Login suite', () => {
  test.describe.configure({ mode: 'parallel' });

  test('Login', async ({ page }, testInfo) => {
    test.setTimeout(1020000);
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });
    await page.goto('https://taskflow-env.lovable.app');
    await runSteps({
      projectId: '696615b7e55e6da5d7233eae',
      page,
      userFlow: 'Login',
      steps: [
      // ══ Main Test: Login ══
      {
        'description': 'Click on the "Email" input field'
      },
      {
        'description': 'Type "demo@test.com" into the "Email" input field',
        'data': { 'value': 'demo@test.com' }
      },
      {
        'description': 'Click on the "Password" input field'
      },
      {
        'description': 'Type "password123" into the "Password" input field',
        'data': { 'value': 'password123' }
      },
      {
        'description': 'Click the "Sign In" button',
        'waitUntil': 'Welcome back, Demo User!'
      }
      ],
      bypassCache: true,
      auth: undefined,
      test,
      expect,
      assertions: [],
    });

    // Extract storage state for login suite
    await page.context().storageState({ path: "storage/auth.json" });
  });
});
