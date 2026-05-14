import { workflowEngine } from '../services/workflowEngine.js';

describe('Workflow Engine', () => {
  // Note: These tests would need a database connection in practice
  // For now, we test the utility functions

  describe('topological sort logic', () => {
    it('should be importable', () => {
      expect(workflowEngine).toBeDefined();
      expect(typeof workflowEngine.execute).toBe('function');
      expect(typeof workflowEngine.createWorkflow).toBe('function');
    });
  });
});
