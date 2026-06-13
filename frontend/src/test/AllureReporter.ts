import AllureVitestReporter from 'allure-vitest/reporter';

type VitestProject = { config: { runner?: string } };
type VitestFacade = { projects: VitestProject[] };

/**
 * Thin wrapper around the official Allure Vitest reporter.
 *
 * The default reporter replaces Vitest's runner with a custom concurrency-aware
 * runner. In this project that custom runner hits a "Vitest failed to find the
 * runner" error because it imports `vitest` at the top level before the runner
 * is initialized. We let the base reporter initialize, then restore the
 * original Vitest runner so the tests can execute normally while Allure still
 * emits results.
 */
export default class AllureReporter extends AllureVitestReporter {
  onInit(vitest: VitestFacade) {
    const originalRunners = new Map<VitestProject, string | undefined>();
    for (const project of vitest.projects) {
      originalRunners.set(project, project.config.runner);
    }

    super.onInit(vitest as any);

    for (const project of vitest.projects) {
      project.config.runner = originalRunners.get(project);
    }
  }
}
