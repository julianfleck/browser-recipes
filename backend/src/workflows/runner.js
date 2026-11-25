import { createHttpSessionTransport } from './http-session-transport.js';
import { createBrowserSessionTransport } from './browser-session-transport.js';

export function createWorkflowRunner({ store, workflows, fetchImpl = fetch, browserFactory = createBrowserSessionTransport }) {
  const registry = new Map();
  for (const workflow of workflows) {
    if (!workflow.id || !workflow.provider || !workflow.sessionOrigin || workflow.effect !== 'read' || !Array.isArray(workflow.steps) || !workflow.steps.length || registry.has(workflow.id)) {
      throw new Error('Invalid or duplicate workflow definition');
    }
    registry.set(workflow.id, workflow);
  }

  return Object.freeze({
    list() { return [...registry.values()].map(({ id, provider, sessionOrigin, effect }) => ({ id, provider, sessionOrigin, effect })); },
    async run(id) {
      const workflow = registry.get(id);
      if (!workflow) throw new Error('Unknown workflow');
      const snapshot = await store.load(workflow.sessionOrigin);
      if (!snapshot || snapshot.origin !== workflow.sessionOrigin) throw new Error('Saved session unavailable');
      const context = Object.freeze({
        http: createHttpSessionTransport(snapshot, { fetchImpl }),
        browser: browserFactory(snapshot, { onCheckpoint: updated => store.save(updated) }),
      });
      const steps = Object.create(null);
      for (const step of workflow.steps) {
        if (!step.id || Object.hasOwn(steps, step.id)) throw new Error('Invalid workflow step');
        steps[step.id] = await step.run(context, steps);
      }
      const result = workflow.result(steps);
      return { workflowId: workflow.id, provider: workflow.provider, sessionOrigin: workflow.sessionOrigin, ...result };
    },
  });
}
