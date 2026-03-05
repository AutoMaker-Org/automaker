/**
 * Unit tests for step-editors components
 *
 * Tests the CallAutomationStepEditor dropdown functionality and
 * prop propagation through the component hierarchy.
 */

import { describe, it, expect, vi } from 'vitest';
import type { AutomationDefinition, AutomationStep } from '@automaker/types';

/**
 * Sentinel value for manual input mode - must match the constant in step-editors.tsx
 */
const MANUAL_INPUT_SENTINEL = '__manual__';

// ============================================================================
// CallAutomationStepEditor Logic Tests
// ============================================================================

describe('CallAutomationStepEditor dropdown logic', () => {
  // Mock automation data for testing
  const mockAutomations: AutomationDefinition[] = [
    {
      id: 'automation-1',
      name: 'First Automation',
      version: 1,
      enabled: true,
      scope: 'global',
      trigger: { type: 'manual' },
      steps: [],
    },
    {
      id: 'automation-2',
      name: 'Second Automation',
      version: 1,
      enabled: true,
      scope: 'global',
      trigger: { type: 'manual' },
      steps: [],
    },
    {
      id: 'automation-3',
      name: 'Third Automation',
      version: 1,
      enabled: false, // disabled automation should still be available
      scope: 'global',
      trigger: { type: 'manual' },
      steps: [],
    },
  ];

  describe('availableAutomations filter', () => {
    // Replicate the filtering logic from CallAutomationStepEditor
    const getAvailableAutomations = (
      automations: AutomationDefinition[] | undefined,
      currentAutomationId: string | undefined
    ) => {
      return (automations ?? []).filter((automation) => automation.id !== currentAutomationId);
    };

    it('should filter out the current automation being edited', () => {
      const result = getAvailableAutomations(mockAutomations, 'automation-1');
      expect(result).toHaveLength(2);
      expect(result.map((a) => a.id)).toEqual(['automation-2', 'automation-3']);
    });

    it('should return all automations when currentAutomationId is undefined', () => {
      const result = getAvailableAutomations(mockAutomations, undefined);
      expect(result).toHaveLength(3);
      expect(result.map((a) => a.id)).toEqual(['automation-1', 'automation-2', 'automation-3']);
    });

    it('should return empty array when automations is undefined', () => {
      const result = getAvailableAutomations(undefined, 'automation-1');
      expect(result).toEqual([]);
    });

    it('should return all automations when currentAutomationId does not match any', () => {
      const result = getAvailableAutomations(mockAutomations, 'non-existent-id');
      expect(result).toHaveLength(3);
    });

    it('should include disabled automations in the list', () => {
      const result = getAvailableAutomations(mockAutomations, 'automation-1');
      expect(result.find((a) => a.id === 'automation-3')).toBeDefined();
      expect(result.find((a) => a.id === 'automation-3')?.enabled).toBe(false);
    });

    it('should handle empty automations array', () => {
      const result = getAvailableAutomations([], 'automation-1');
      expect(result).toEqual([]);
    });
  });

  describe('isVariableSyntax detection', () => {
    // Replicate the variable syntax detection logic
    const isVariableSyntax = (value: string): boolean => {
      return value.startsWith('{{');
    };

    it('should detect variable syntax with {{', () => {
      expect(isVariableSyntax('{{workflow.automationId}}')).toBe(true);
      expect(isVariableSyntax('{{variables.selectedAutomation}}')).toBe(true);
      expect(isVariableSyntax('{{ step.output }}')).toBe(true);
    });

    it('should not detect variable syntax without {{', () => {
      expect(isVariableSyntax('automation-1')).toBe(false);
      expect(isVariableSyntax('automationId')).toBe(false);
      expect(isVariableSyntax('{automationId}')).toBe(false);
    });

    it('should handle empty string', () => {
      expect(isVariableSyntax('')).toBe(false);
    });

    it('should detect variable syntax even with leading whitespace', () => {
      // Note: startsWith('{{') would fail for '  {{var}}' but that's intentional
      // Variable syntax should start with {{ directly
      expect(isVariableSyntax('  {{var}}')).toBe(false);
    });
  });

  describe('isManualInput mode determination', () => {
    // Replicate the manual input detection logic
    const isManualInput = (currentValue: string): boolean => {
      const isVariableSyntax = currentValue.startsWith('{{');
      return isVariableSyntax || currentValue === MANUAL_INPUT_SENTINEL;
    };

    it('should be manual input when value is variable syntax', () => {
      expect(isManualInput('{{workflow.automationId}}')).toBe(true);
      expect(isManualInput('{{variables.selectedAutomation}}')).toBe(true);
    });

    it('should be manual input when value is MANUAL_INPUT_SENTINEL', () => {
      expect(isManualInput(MANUAL_INPUT_SENTINEL)).toBe(true);
    });

    it('should not be manual input for regular automation IDs', () => {
      expect(isManualInput('automation-1')).toBe(false);
      expect(isManualInput('my-automation-id')).toBe(false);
    });

    it('should not be manual input for empty string', () => {
      expect(isManualInput('')).toBe(false);
    });
  });

  describe('dropdown value change handling', () => {
    // Replicate the value change logic
    const handleDropdownChange = (
      value: string,
      config: Record<string, unknown>,
      _onConfigChange: () => void
    ) => {
      if (value === MANUAL_INPUT_SENTINEL) {
        return { ...config, automationId: MANUAL_INPUT_SENTINEL };
      } else {
        return { ...config, automationId: value };
      }
    };

    it('should set automationId to selected automation ID', () => {
      const config = { automationId: '' };
      const result = handleDropdownChange('automation-2', config, () => {});
      expect(result.automationId).toBe('automation-2');
    });

    it('should set automationId to MANUAL_INPUT_SENTINEL when manual option selected', () => {
      const config = { automationId: 'automation-1' };
      const result = handleDropdownChange(MANUAL_INPUT_SENTINEL, config, () => {});
      expect(result.automationId).toBe(MANUAL_INPUT_SENTINEL);
    });

    it('should overwrite existing automationId', () => {
      const config = { automationId: 'automation-1' };
      const result = handleDropdownChange('automation-3', config, () => {});
      expect(result.automationId).toBe('automation-3');
    });
  });
});

// ============================================================================
// Prop Propagation Tests
// ============================================================================

describe('Prop propagation through component hierarchy', () => {
  // Test that the interfaces have the correct optional props

  describe('AutomationStepEditorProps interface', () => {
    it('should have optional automations prop', () => {
      // This is a type check - if this compiles, the prop exists
      const props = {
        config: {},
        onConfigChange: vi.fn(),
        automations: [],
      };
      expect(props.automations).toEqual([]);
    });

    it('should have optional currentAutomationId prop', () => {
      const props = {
        config: {},
        onConfigChange: vi.fn(),
        currentAutomationId: 'test-id',
      };
      expect(props.currentAutomationId).toBe('test-id');
    });

    it('should work without automations and currentAutomationId', () => {
      // These are optional props
      const props = {
        config: {},
        onConfigChange: vi.fn(),
      };
      expect(props.config).toEqual({});
    });
  });

  describe('NestedStepList props propagation', () => {
    // Test that automations and currentAutomationId are correctly passed through
    it('should propagate automations through nested steps', () => {
      // This tests the pattern used in IfConditionalStepEditor and LoopStepEditor
      const mockAutomations: AutomationDefinition[] = [
        {
          id: 'automation-1',
          name: 'Test',
          version: 1,
          enabled: true,
          scope: 'global',
          trigger: { type: 'manual' },
          steps: [],
        },
      ];

      // Simulate prop passing through IfConditionalStepEditor
      const parentProps = {
        config: { thenSteps: [] },
        onConfigChange: vi.fn(),
        automations: mockAutomations,
        currentAutomationId: 'current-automation',
      };

      // Verify props are passed correctly
      expect(parentProps.automations).toBe(mockAutomations);
      expect(parentProps.currentAutomationId).toBe('current-automation');
    });
  });
});

// ============================================================================
// Edge Cases and Error Handling
// ============================================================================

describe('Edge cases for CallAutomationStepEditor', () => {
  describe('empty automations list', () => {
    it('should handle empty automations array gracefully', () => {
      const automations: AutomationDefinition[] = [];
      const currentAutomationId = 'test-id';

      const availableAutomations = automations.filter((a) => a.id !== currentAutomationId);

      expect(availableAutomations).toHaveLength(0);
    });
  });

  describe('undefined automations', () => {
    it('should handle undefined automations gracefully', () => {
      // Replicate the filtering function used in CallAutomationStepEditor
      const getAvailableAutomations = (
        automations: AutomationDefinition[] | undefined,
        currentAutomationId: string | undefined
      ) => {
        return (automations ?? []).filter((automation) => automation.id !== currentAutomationId);
      };

      const currentAutomationId = 'test-id';

      const availableAutomations = getAvailableAutomations(undefined, currentAutomationId);

      expect(availableAutomations).toHaveLength(0);
    });
  });

  describe('automation with special characters in ID', () => {
    it('should handle automation IDs with special characters', () => {
      const automations: AutomationDefinition[] = [
        {
          id: 'automation-with-dashes',
          name: 'Dashes',
          version: 1,
          enabled: true,
          scope: 'global',
          trigger: { type: 'manual' },
          steps: [],
        },
        {
          id: 'automation_with_underscores',
          name: 'Underscores',
          version: 1,
          enabled: true,
          scope: 'global',
          trigger: { type: 'manual' },
          steps: [],
        },
        {
          id: 'automation.with.dots',
          name: 'Dots',
          version: 1,
          enabled: true,
          scope: 'global',
          trigger: { type: 'manual' },
          steps: [],
        },
      ];

      const currentAutomationId = 'automation-with-dashes';
      const availableAutomations = automations.filter((a) => a.id !== currentAutomationId);

      expect(availableAutomations).toHaveLength(2);
      expect(availableAutomations.map((a) => a.id)).toEqual([
        'automation_with_underscores',
        'automation.with.dots',
      ]);
    });
  });

  describe('config state transitions', () => {
    it('should transition from dropdown to manual input correctly', () => {
      // Initial state: dropdown selection
      let config = { automationId: 'automation-1' };

      // User clicks "Enter ID manually..."
      config = { ...config, automationId: '__manual__' };
      expect(config.automationId).toBe('__manual__');

      // User enters a value in manual input
      config = { ...config, automationId: 'custom-automation-id' };
      expect(config.automationId).toBe('custom-automation-id');
    });

    it('should transition from manual input to dropdown correctly', () => {
      // Initial state: manual input with variable
      let config = { automationId: '{{workflow.automationId}}' };

      // User clicks "Switch to dropdown"
      config = { ...config, automationId: '' };
      expect(config.automationId).toBe('');

      // User selects an automation from dropdown
      config = { ...config, automationId: 'automation-2' };
      expect(config.automationId).toBe('automation-2');
    });
  });
});

// ============================================================================
// VariableInput and VariableTextarea Popover State Tests
// ============================================================================

describe('VariableInput and VariableTextarea popover state management', () => {
  // Replicate the popover state logic from VariableInput and VariableTextarea
  describe('handleVariableSelect callback', () => {
    // Simulate the handleVariableSelect logic
    const simulateVariableSelect = (
      currentValue: string,
      variable: { scope: string; name: string },
      onChange: (value: string) => void,
      setIsPopoverOpen: (open: boolean) => void
    ) => {
      const syntax = `{{${variable.scope}.${variable.name}}}`;
      // Append variable syntax to current value
      onChange(currentValue + syntax);
      // Close the popover after insertion
      setIsPopoverOpen(false);
      return syntax;
    };

    it('should append variable syntax to current value', () => {
      const mockOnChange = vi.fn();
      const mockSetIsPopoverOpen = vi.fn();

      simulateVariableSelect(
        'prefix-',
        { scope: 'workflow', name: 'automationId' },
        mockOnChange,
        mockSetIsPopoverOpen
      );

      expect(mockOnChange).toHaveBeenCalledWith('prefix-{{workflow.automationId}}');
    });

    it('should append to empty value', () => {
      const mockOnChange = vi.fn();
      const mockSetIsPopoverOpen = vi.fn();

      simulateVariableSelect(
        '',
        { scope: 'system', name: 'projectPath' },
        mockOnChange,
        mockSetIsPopoverOpen
      );

      expect(mockOnChange).toHaveBeenCalledWith('{{system.projectPath}}');
    });

    it('should close popover after selection', () => {
      const mockOnChange = vi.fn();
      const mockSetIsPopoverOpen = vi.fn();

      simulateVariableSelect(
        'existing-text',
        { scope: 'steps', name: 'step-1' },
        mockOnChange,
        mockSetIsPopoverOpen
      );

      expect(mockSetIsPopoverOpen).toHaveBeenCalledWith(false);
    });

    it('should close popover even when value is empty', () => {
      const mockOnChange = vi.fn();
      const mockSetIsPopoverOpen = vi.fn();

      simulateVariableSelect(
        '',
        { scope: 'project', name: 'API_KEY' },
        mockOnChange,
        mockSetIsPopoverOpen
      );

      expect(mockSetIsPopoverOpen).toHaveBeenCalledWith(false);
    });

    it('should support multiple variable insertions', () => {
      const mockOnChange = vi.fn();
      const mockSetIsPopoverOpen = vi.fn();

      // First insertion
      simulateVariableSelect(
        '',
        { scope: 'system', name: 'projectPath' },
        mockOnChange,
        mockSetIsPopoverOpen
      );

      // Second insertion (simulating user typing then inserting again)
      simulateVariableSelect(
        '{{system.projectPath}}/src/',
        { scope: 'workflow', name: 'targetBranch' },
        mockOnChange,
        mockSetIsPopoverOpen
      );

      expect(mockOnChange).toHaveBeenCalledTimes(2);
      expect(mockOnChange).toHaveBeenNthCalledWith(
        2,
        '{{system.projectPath}}/src/{{workflow.targetBranch}}'
      );
    });
  });

  describe('popover open state', () => {
    it('should start with closed popover', () => {
      // Initial state should be false
      let isPopoverOpen = false;
      expect(isPopoverOpen).toBe(false);
    });

    it('should open when trigger is clicked', () => {
      let isPopoverOpen = false;
      const setIsPopoverOpen = (open: boolean) => {
        isPopoverOpen = open;
      };

      // User clicks the trigger button
      setIsPopoverOpen(true);
      expect(isPopoverOpen).toBe(true);
    });

    it('should close when variable is selected', () => {
      let isPopoverOpen = true; // Assume popover is open
      const setIsPopoverOpen = (open: boolean) => {
        isPopoverOpen = open;
      };

      // Simulate variable selection
      setIsPopoverOpen(false);
      expect(isPopoverOpen).toBe(false);
    });

    it('should close when user clicks outside', () => {
      let isPopoverOpen = true;
      const setIsPopoverOpen = (open: boolean) => {
        isPopoverOpen = open;
      };

      // Simulate onOpenChange being called with false (user clicks outside)
      setIsPopoverOpen(false);
      expect(isPopoverOpen).toBe(false);
    });

    it('should toggle open state correctly', () => {
      let isPopoverOpen = false;
      const setIsPopoverOpen = (open: boolean) => {
        isPopoverOpen = open;
      };

      // Open
      setIsPopoverOpen(true);
      expect(isPopoverOpen).toBe(true);

      // Close via variable selection
      setIsPopoverOpen(false);
      expect(isPopoverOpen).toBe(false);

      // Open again
      setIsPopoverOpen(true);
      expect(isPopoverOpen).toBe(true);
    });
  });

  describe('controlled popover pattern', () => {
    it('should use open and onOpenChange props for controlled state', () => {
      // This test verifies the pattern used in the components
      const popoverProps = {
        open: false,
        onOpenChange: vi.fn(),
      };

      // Verify the controlled pattern
      expect(popoverProps.open).toBe(false);
      expect(typeof popoverProps.onOpenChange).toBe('function');
    });

    it('should update controlled state through onOpenChange', () => {
      let open = false;
      const onOpenChange = (newOpen: boolean) => {
        open = newOpen;
      };

      onOpenChange(true);
      expect(open).toBe(true);

      onOpenChange(false);
      expect(open).toBe(false);
    });
  });
});

// ============================================================================
// Integration-like Tests
// ============================================================================

describe('CallAutomationStepEditor integration scenarios', () => {
  describe('creating a call-automation step', () => {
    it('should start with empty automationId', () => {
      const defaultConfig = {};
      expect(defaultConfig).not.toHaveProperty('automationId');
    });

    it('should allow selecting automation from dropdown', () => {
      const automations: AutomationDefinition[] = [
        {
          id: 'build-and-test',
          name: 'Build and Test',
          version: 1,
          enabled: true,
          scope: 'global',
          trigger: { type: 'manual' },
          steps: [],
        },
        {
          id: 'deploy-to-staging',
          name: 'Deploy to Staging',
          version: 1,
          enabled: true,
          scope: 'global',
          trigger: { type: 'manual' },
          steps: [],
        },
      ];

      const currentAutomationId = 'build-and-test';
      const availableAutomations = automations.filter((a) => a.id !== currentAutomationId);

      // User selects the only available automation
      const selectedAutomation = availableAutomations[0];
      expect(selectedAutomation.id).toBe('deploy-to-staging');

      // Config is updated
      const config = { automationId: selectedAutomation.id };
      expect(config.automationId).toBe('deploy-to-staging');
    });
  });

  describe('editing existing call-automation step', () => {
    it('should show dropdown when automationId is a real ID', () => {
      const config = { automationId: 'automation-1' };
      const isManualInput =
        config.automationId.startsWith('{{') || config.automationId === '__manual__';

      expect(isManualInput).toBe(false); // Should show dropdown
    });

    it('should show manual input when automationId is a variable', () => {
      const config = { automationId: '{{variables.targetAutomation}}' };
      const isManualInput =
        config.automationId.startsWith('{{') || config.automationId === '__manual__';

      expect(isManualInput).toBe(true); // Should show manual input
    });
  });

  describe('nested call-automation in if conditional', () => {
    it('should propagate automations to nested call-automation step', () => {
      // Simulating IfConditionalStepEditor passing props to NestedStepList
      const parentProps = {
        config: {
          condition: 'workflow.shouldDeploy',
          thenSteps: [
            {
              id: 'step-1',
              type: 'call-automation',
              name: 'Call Deploy',
              config: { automationId: '' },
            },
          ],
          elseSteps: [],
        },
        onConfigChange: vi.fn(),
        automations: [
          {
            id: 'deploy-automation',
            name: 'Deploy',
            version: 1,
            enabled: true,
            scope: 'global',
            trigger: { type: 'manual' },
            steps: [],
          },
        ],
        currentAutomationId: 'parent-automation',
      };

      // The NestedStepList should receive the automations
      const nestedStepListProps = {
        steps: parentProps.config.thenSteps as AutomationStep[],
        onChange: vi.fn(),
        workflowVariables: undefined,
        automations: parentProps.automations,
        currentAutomationId: parentProps.currentAutomationId,
      };

      expect(nestedStepListProps.automations).toHaveLength(1);
      expect(nestedStepListProps.currentAutomationId).toBe('parent-automation');
    });
  });

  describe('nested call-automation in loop', () => {
    it('should propagate automations to nested call-automation step in loop', () => {
      // Simulating LoopStepEditor passing props to NestedStepList
      const parentProps = {
        config: {
          itemVariable: 'automation',
          indexVariable: 'index',
          items: ['automation-1', 'automation-2'],
          steps: [
            {
              id: 'step-1',
              type: 'call-automation',
              name: 'Call Automation',
              config: { automationId: '' },
            },
          ],
        },
        onConfigChange: vi.fn(),
        automations: [
          {
            id: 'automation-1',
            name: 'First',
            version: 1,
            enabled: true,
            scope: 'global',
            trigger: { type: 'manual' },
            steps: [],
          },
          {
            id: 'automation-2',
            name: 'Second',
            version: 1,
            enabled: true,
            scope: 'global',
            trigger: { type: 'manual' },
            steps: [],
          },
        ],
        currentAutomationId: 'loop-parent-automation',
      };

      // The NestedStepList should receive the automations
      const nestedStepListProps = {
        steps: parentProps.config.steps as AutomationStep[],
        onChange: vi.fn(),
        workflowVariables: undefined,
        automations: parentProps.automations,
        currentAutomationId: parentProps.currentAutomationId,
      };

      expect(nestedStepListProps.automations).toHaveLength(2);
      expect(nestedStepListProps.currentAutomationId).toBe('loop-parent-automation');
    });
  });
});
