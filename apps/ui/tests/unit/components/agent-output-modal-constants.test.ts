/**
 * Tests for AgentOutputModal constants
 * Verifies MODAL_CONSTANTS values used throughout the modal component
 * to ensure centralized configuration is correct and type-safe.
 */

import { describe, it, expect } from 'vitest';
import { MODAL_CONSTANTS } from '../../../src/components/views/board-view/dialogs/agent-output-modal.constants';

describe('MODAL_CONSTANTS', () => {
  describe('AUTOSCROLL_THRESHOLD', () => {
    it('should be a positive number for scroll detection', () => {
      expect(MODAL_CONSTANTS.AUTOSCROLL_THRESHOLD).toBe(50);
      expect(typeof MODAL_CONSTANTS.AUTOSCROLL_THRESHOLD).toBe('number');
    });
  });

  describe('MODAL_CLOSE_DELAY_MS', () => {
    it('should provide reasonable delay for modal auto-close', () => {
      expect(MODAL_CONSTANTS.MODAL_CLOSE_DELAY_MS).toBe(1500);
    });
  });

  describe('VIEW_MODES', () => {
    it('should define all four view modes', () => {
      expect(MODAL_CONSTANTS.VIEW_MODES).toEqual({
        SUMMARY: 'summary',
        PARSED: 'parsed',
        RAW: 'raw',
        CHANGES: 'changes',
      });
    });

    it('should have string values for each mode', () => {
      expect(typeof MODAL_CONSTANTS.VIEW_MODES.SUMMARY).toBe('string');
      expect(typeof MODAL_CONSTANTS.VIEW_MODES.PARSED).toBe('string');
      expect(typeof MODAL_CONSTANTS.VIEW_MODES.RAW).toBe('string');
      expect(typeof MODAL_CONSTANTS.VIEW_MODES.CHANGES).toBe('string');
    });
  });

  describe('HEIGHT_CONSTRAINTS', () => {
    it('should define mobile, small, and tablet height constraints', () => {
      expect(MODAL_CONSTANTS.HEIGHT_CONSTRAINTS.MOBILE_MAX_DVH).toBe('85dvh');
      expect(MODAL_CONSTANTS.HEIGHT_CONSTRAINTS.SMALL_MAX_VH).toBe('80vh');
      expect(MODAL_CONSTANTS.HEIGHT_CONSTRAINTS.TABLET_MAX_VH).toBe('85vh');
    });
  });

  describe('WIDTH_CONSTRAINTS', () => {
    it('should define responsive width constraints', () => {
      expect(MODAL_CONSTANTS.WIDTH_CONSTRAINTS.MOBILE_MAX_CALC).toBe('calc(100% - 2rem)');
      expect(MODAL_CONSTANTS.WIDTH_CONSTRAINTS.SMALL_MAX_VW).toBe('60vw');
      expect(MODAL_CONSTANTS.WIDTH_CONSTRAINTS.TABLET_MAX_VW).toBe('90vw');
      expect(MODAL_CONSTANTS.WIDTH_CONSTRAINTS.TABLET_MAX_WIDTH).toBe('1200px');
    });
  });

  describe('COMPONENT_HEIGHTS', () => {
    it('should define complete Tailwind class fragments for template interpolation', () => {
      expect(MODAL_CONSTANTS.COMPONENT_HEIGHTS.SMALL_MIN).toBe('sm:min-h-[200px]');
      expect(MODAL_CONSTANTS.COMPONENT_HEIGHTS.SMALL_MAX).toBe('sm:max-h-[60vh]');
    });
  });
});
