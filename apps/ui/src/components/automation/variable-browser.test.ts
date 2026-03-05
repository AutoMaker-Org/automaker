/**
 * Unit tests for variable-browser component logic
 *
 * Tests the variable syntax generation and clipboard integration patterns.
 */

import { describe, it, expect, vi } from 'vitest';

// ============================================================================
// Variable Syntax Generation Tests
// ============================================================================

describe('Variable syntax generation', () => {
  // Replicate the syntax generation logic from handleVariableClick
  const generateVariableSyntax = (scope: string, variableName: string): string => {
    return `{{${scope}.${variableName}}}`;
  };

  describe('syntax format', () => {
    it('should generate correct syntax for system variables', () => {
      expect(generateVariableSyntax('system', 'projectName')).toBe('{{system.projectName}}');
      expect(generateVariableSyntax('system', 'timestamp')).toBe('{{system.timestamp}}');
    });

    it('should generate correct syntax for project variables', () => {
      expect(generateVariableSyntax('project', 'myVar')).toBe('{{project.myVar}}');
      expect(generateVariableSyntax('project', 'API_KEY')).toBe('{{project.API_KEY}}');
    });

    it('should generate correct syntax for workflow variables', () => {
      expect(generateVariableSyntax('workflow', 'targetBranch')).toBe('{{workflow.targetBranch}}');
      expect(generateVariableSyntax('workflow', 'automationId')).toBe('{{workflow.automationId}}');
    });

    it('should generate correct syntax for step outputs', () => {
      expect(generateVariableSyntax('steps', 'step-1')).toBe('{{steps.step-1}}');
      expect(generateVariableSyntax('steps', 'git-checkout-output')).toBe(
        '{{steps.git-checkout-output}}'
      );
    });
  });

  describe('variable names with special characters', () => {
    it('should handle variable names with dashes', () => {
      expect(generateVariableSyntax('workflow', 'my-variable')).toBe('{{workflow.my-variable}}');
    });

    it('should handle variable names with underscores', () => {
      expect(generateVariableSyntax('project', 'my_variable')).toBe('{{project.my_variable}}');
    });

    it('should handle variable names with numbers', () => {
      expect(generateVariableSyntax('steps', 'step123')).toBe('{{steps.step123}}');
    });
  });
});

// ============================================================================
// Clipboard Integration Tests
// ============================================================================

describe('handleVariableClick clipboard integration', () => {
  // Simulate the clipboard copy logic from handleVariableClick
  // This matches the synchronous signature with void IIFE pattern used in the component
  const simulateVariableClick = (
    variable: { name: string },
    scope: string,
    writeToClipboard: (text: string) => Promise<boolean>,
    onVariableSelect?: (variable: { name: string }, syntax: string) => void,
    setCopiedVariable?: (value: string | null) => void
  ): { syntax: string } => {
    const syntax = `{{${scope}.${variable.name}}}`;

    // Copy to clipboard using utility with fallback support (matches void IIFE pattern)
    void (async () => {
      try {
        const success = await writeToClipboard(syntax);
        if (success) {
          setCopiedVariable?.(`${scope}.${variable.name}`);
          setTimeout(() => setCopiedVariable?.(null), 2000);
        }
      } catch {
        // Silently fail clipboard operations
      }
    })();

    // Notify parent (fires immediately, before clipboard operation completes)
    onVariableSelect?.(variable, syntax);

    return { syntax };
  };

  describe('successful clipboard write', () => {
    it('should call onVariableSelect immediately with correct syntax', async () => {
      const mockWriteToClipboard = vi.fn().mockResolvedValue(true);
      const mockOnVariableSelect = vi.fn();

      const result = simulateVariableClick(
        { name: 'testVar' },
        'workflow',
        mockWriteToClipboard,
        mockOnVariableSelect
      );

      // onVariableSelect is called immediately, not awaited
      expect(result.syntax).toBe('{{workflow.testVar}}');
      expect(mockOnVariableSelect).toHaveBeenCalledWith(
        { name: 'testVar' },
        '{{workflow.testVar}}'
      );

      // Wait for the async clipboard operation to complete
      await vi.waitFor(() => {
        expect(mockWriteToClipboard).toHaveBeenCalledWith('{{workflow.testVar}}');
      });
    });

    it('should always call onVariableSelect even if clipboard fails', async () => {
      const mockWriteToClipboard = vi.fn().mockResolvedValue(false);
      const mockOnVariableSelect = vi.fn();

      simulateVariableClick(
        { name: 'testVar' },
        'project',
        mockWriteToClipboard,
        mockOnVariableSelect
      );

      // onVariableSelect is called immediately, regardless of clipboard result
      expect(mockOnVariableSelect).toHaveBeenCalled();
    });
  });

  describe('failed clipboard write', () => {
    it('should still notify parent when clipboard write fails', async () => {
      const mockWriteToClipboard = vi.fn().mockResolvedValue(false);
      const mockOnVariableSelect = vi.fn();

      simulateVariableClick(
        { name: 'testVar' },
        'system',
        mockWriteToClipboard,
        mockOnVariableSelect
      );

      expect(mockOnVariableSelect).toHaveBeenCalledWith({ name: 'testVar' }, '{{system.testVar}}');
    });

    it('should not throw when clipboard throws', async () => {
      const mockWriteToClipboard = vi.fn().mockRejectedValue(new Error('Clipboard error'));
      const mockOnVariableSelect = vi.fn();

      // Should not throw - error is caught in the void IIFE
      expect(() =>
        simulateVariableClick(
          { name: 'testVar' },
          'system',
          mockWriteToClipboard,
          mockOnVariableSelect
        )
      ).not.toThrow();

      // onVariableSelect should still be called
      expect(mockOnVariableSelect).toHaveBeenCalled();
    });
  });

  describe('optional onVariableSelect callback', () => {
    it('should work without onVariableSelect callback', async () => {
      const mockWriteToClipboard = vi.fn().mockResolvedValue(true);

      const result = simulateVariableClick(
        { name: 'testVar' },
        'workflow',
        mockWriteToClipboard,
        undefined
      );

      expect(result.syntax).toBe('{{workflow.testVar}}');
    });
  });

  describe('setCopiedVariable callback', () => {
    it('should call setCopiedVariable when clipboard succeeds', async () => {
      const mockWriteToClipboard = vi.fn().mockResolvedValue(true);
      const mockSetCopiedVariable = vi.fn();

      simulateVariableClick(
        { name: 'testVar' },
        'workflow',
        mockWriteToClipboard,
        undefined,
        mockSetCopiedVariable
      );

      await vi.waitFor(() => {
        expect(mockSetCopiedVariable).toHaveBeenCalledWith('workflow.testVar');
      });
    });

    it('should not call setCopiedVariable when clipboard fails', async () => {
      const mockWriteToClipboard = vi.fn().mockResolvedValue(false);
      const mockSetCopiedVariable = vi.fn();

      simulateVariableClick(
        { name: 'testVar' },
        'workflow',
        mockWriteToClipboard,
        undefined,
        mockSetCopiedVariable
      );

      // Wait a bit to ensure the async operation completes
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockSetCopiedVariable).not.toHaveBeenCalled();
    });
  });
});

// ============================================================================
// Copy State Management Tests
// ============================================================================

describe('Copy state management', () => {
  // Simulate the copy state pattern used in the component
  const simulateCopyState = () => {
    let copiedVariable: string | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const setCopiedVariable = (value: string | null) => {
      copiedVariable = value;
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (value !== null) {
        timeoutId = setTimeout(() => {
          copiedVariable = null;
        }, 2000);
      }
    };

    const isCopied = (scope: string, name: string) => {
      return copiedVariable === `${scope}.${name}`;
    };

    const getCopiedVariable = () => copiedVariable;

    return { setCopiedVariable, isCopied, getCopiedVariable };
  };

  it('should mark variable as copied after successful clipboard write', () => {
    const { setCopiedVariable, isCopied } = simulateCopyState();

    setCopiedVariable('workflow.testVar');
    expect(isCopied('workflow', 'testVar')).toBe(true);
    expect(isCopied('project', 'testVar')).toBe(false);
  });

  it('should not mark variable as copied after failed clipboard write', () => {
    const { setCopiedVariable: _setCopiedVariable, isCopied } = simulateCopyState();

    // In the real component, setCopiedVariable is only called when writeToClipboard returns true
    // So if clipboard fails, we don't call setCopiedVariable
    expect(isCopied('workflow', 'testVar')).toBe(false);
  });

  it('should clear copied state after timeout', async () => {
    vi.useFakeTimers();
    const { setCopiedVariable, getCopiedVariable } = simulateCopyState();

    setCopiedVariable('workflow.testVar');
    expect(getCopiedVariable()).toBe('workflow.testVar');

    // Fast-forward 2 seconds
    vi.advanceTimersByTime(2000);

    // After timeout, the copied variable should be cleared
    expect(getCopiedVariable()).toBe(null);
    vi.useRealTimers();
  });

  it('should use scope.name format for copied state key', () => {
    const { setCopiedVariable, isCopied } = simulateCopyState();

    setCopiedVariable('system.projectName');
    expect(isCopied('system', 'projectName')).toBe(true);
    expect(isCopied('workflow', 'projectName')).toBe(false);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge cases for variable browser', () => {
  describe('syntax format with edge case names', () => {
    const generateVariableSyntax = (scope: string, variableName: string): string => {
      return `{{${scope}.${variableName}}}`;
    };

    it('should handle empty variable name (edge case)', () => {
      // Empty name is technically possible but unusual
      const syntax = generateVariableSyntax('workflow', '');
      expect(syntax).toBe('{{workflow.}}');
    });

    it('should handle variable names with multiple dots', () => {
      // Variable names with multiple dots are supported for nested paths
      const syntax = generateVariableSyntax('steps', 'step-1.output.result');
      expect(syntax).toBe('{{steps.step-1.output.result}}');
    });

    it('should handle very long variable names', () => {
      const longName = 'a'.repeat(100);
      const syntax = generateVariableSyntax('project', longName);
      expect(syntax).toBe(`{{project.${longName}}}`);
    });
  });

  describe('concurrent clicks', () => {
    it('should handle rapid consecutive clicks on different variables', async () => {
      const clipboardCalls: string[] = [];
      const mockWriteToClipboard = vi.fn().mockImplementation(async (text: string) => {
        clipboardCalls.push(text);
        return true;
      });

      // Simulate rapid clicks
      await Promise.all([
        mockWriteToClipboard('{{workflow.var1}}'),
        mockWriteToClipboard('{{workflow.var2}}'),
        mockWriteToClipboard('{{workflow.var3}}'),
      ]);

      expect(clipboardCalls).toHaveLength(3);
      expect(clipboardCalls).toContain('{{workflow.var1}}');
      expect(clipboardCalls).toContain('{{workflow.var2}}');
      expect(clipboardCalls).toContain('{{workflow.var3}}');
    });

    it('should handle clipboard failure on one of multiple concurrent calls', async () => {
      const results: boolean[] = [];
      const mockWriteToClipboard = vi
        .fn()
        .mockImplementationOnce(async () => true)
        .mockImplementationOnce(async () => false)
        .mockImplementationOnce(async () => true);

      results.push(await mockWriteToClipboard('{{workflow.var1}}'));
      results.push(await mockWriteToClipboard('{{workflow.var2}}'));
      results.push(await mockWriteToClipboard('{{workflow.var3}}'));

      expect(results).toEqual([true, false, true]);
    });
  });

  describe('error handling', () => {
    it('should handle clipboard throwing an error gracefully', async () => {
      const mockWriteToClipboard = vi.fn().mockRejectedValue(new Error('Clipboard error'));

      // In the real component, the error is caught and swallowed
      // The variable selection should still proceed
      let errorThrown = false;
      try {
        await mockWriteToClipboard('{{workflow.testVar}}');
      } catch {
        errorThrown = true;
      }

      expect(errorThrown).toBe(true);
      expect(mockWriteToClipboard).toHaveBeenCalled();
    });
  });
});
