import { test as base } from "@playwright/test";
import { mockTestAuth } from "./convex-mocks";

/**
 * Local browser tests exercise authenticated product UI with a deterministic
 * same-origin token response. App API routes still verify real Seridian
 * sessions; tests that need server route responses stub those endpoints.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await mockTestAuth(page);
    await use(page);
  },
});

export { expect } from "@playwright/test";
