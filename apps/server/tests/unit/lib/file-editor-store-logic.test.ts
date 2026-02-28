import { describe, it, expect } from 'vitest';
import {
  computeIsDirty,
  updateTabWithContent as updateTabContent,
  markTabAsSaved as markTabSaved,
} from '../../../../ui/src/components/views/file-editor-view/file-editor-dirty-utils.ts';

/**
 * Unit tests for the file editor store logic, focusing on the unsaved indicator fix.
 *
 * The bug was: File unsaved indicators weren't working reliably - editing a file
 * and saving it would sometimes leave the dirty indicator (dot) visible.
 *
 * Root causes:
 * 1. Stale closure in handleSave - captured activeTab could have old content
 * 2. Editor buffer not synced - CodeMirror might have buffered changes not yet in store
 *
 * Fix:
 * - handleSave now gets fresh state from store using getState()
 * - handleSave gets current content from editor via getValue()
 * - Content is synced to store before saving if it differs
 *
 * Since we can't easily test the React/zustand store in node environment,
 * we test the pure logic that the store uses for dirty state tracking.
 */

describe('File editor dirty state logic', () => {
  describe('updateTabContent', () => {
    it('should set isDirty to true when content differs from originalContent', () => {
      const tab = {
        content: 'original content',
        originalContent: 'original content',
        isDirty: false,
      };

      const updated = updateTabContent(tab, 'modified content');

      expect(updated.isDirty).toBe(true);
      expect(updated.content).toBe('modified content');
      expect(updated.originalContent).toBe('original content');
    });

    it('should set isDirty to false when content matches originalContent', () => {
      const tab = {
        content: 'original content',
        originalContent: 'original content',
        isDirty: false,
      };

      // First modify it
      let updated = updateTabContent(tab, 'modified content');
      expect(updated.isDirty).toBe(true);

      // Now update back to original
      updated = updateTabContent(updated, 'original content');
      expect(updated.isDirty).toBe(false);
    });

    it('should handle empty content correctly', () => {
      const tab = {
        content: '',
        originalContent: '',
        isDirty: false,
      };

      const updated = updateTabContent(tab, 'new content');

      expect(updated.isDirty).toBe(true);
    });
  });

  describe('markTabSaved', () => {
    it('should set isDirty to false and update both content and originalContent', () => {
      const tab = {
        content: 'original content',
        originalContent: 'original content',
        isDirty: false,
      };

      // First modify
      let updated = updateTabContent(tab, 'modified content');
      expect(updated.isDirty).toBe(true);

      // Then save
      updated = markTabSaved(updated, 'modified content');

      expect(updated.isDirty).toBe(false);
      expect(updated.content).toBe('modified content');
      expect(updated.originalContent).toBe('modified content');
    });

    it('should correctly clear dirty state when save is triggered after edit', () => {
      // This test simulates the bug scenario:
      // 1. User edits file -> isDirty = true
      // 2. User saves -> markTabSaved should set isDirty = false
      let tab = {
        content: 'initial',
        originalContent: 'initial',
        isDirty: false,
      };

      // Simulate user editing
      tab = updateTabContent(tab, 'initial\nnew line');

      // Should be dirty
      expect(tab.isDirty).toBe(true);

      // Simulate save (with the content that was saved)
      tab = markTabSaved(tab, 'initial\nnew line');

      // Should NOT be dirty anymore
      expect(tab.isDirty).toBe(false);
    });
  });

  describe('race condition handling', () => {
    it('should correctly handle updateTabContent after markTabSaved with same content', () => {
      // This tests the scenario where:
      // 1. CodeMirror has a pending onChange with content "B"
      // 2. User presses save when editor shows "B"
      // 3. markTabSaved is called with "B"
      // 4. CodeMirror's pending onChange fires with "B" (same content)
      // Result: isDirty should remain false
      let tab = {
        content: 'A',
        originalContent: 'A',
        isDirty: false,
      };

      // User edits to "B"
      tab = updateTabContent(tab, 'B');

      // Save with "B"
      tab = markTabSaved(tab, 'B');

      // Late onChange with same content "B"
      tab = updateTabContent(tab, 'B');

      expect(tab.isDirty).toBe(false);
      expect(tab.content).toBe('B');
    });

    it('should correctly handle updateTabContent after markTabSaved with different content', () => {
      // This tests the scenario where:
      // 1. CodeMirror has a pending onChange with content "C"
      // 2. User presses save when store has "B"
      // 3. markTabSaved is called with "B"
      // 4. CodeMirror's pending onChange fires with "C" (different content)
      // Result: isDirty should be true (file changed after save)
      let tab = {
        content: 'A',
        originalContent: 'A',
        isDirty: false,
      };

      // User edits to "B"
      tab = updateTabContent(tab, 'B');

      // Save with "B"
      tab = markTabSaved(tab, 'B');

      // Late onChange with different content "C"
      tab = updateTabContent(tab, 'C');

      // File changed after save, so it should be dirty
      expect(tab.isDirty).toBe(true);
      expect(tab.content).toBe('C');
      expect(tab.originalContent).toBe('B');
    });

    it('should handle rapid edit-save-edit cycle correctly', () => {
      // Simulate rapid user actions
      let tab = {
        content: 'v1',
        originalContent: 'v1',
        isDirty: false,
      };

      // Edit 1
      tab = updateTabContent(tab, 'v2');
      expect(tab.isDirty).toBe(true);

      // Save 1
      tab = markTabSaved(tab, 'v2');
      expect(tab.isDirty).toBe(false);

      // Edit 2
      tab = updateTabContent(tab, 'v3');
      expect(tab.isDirty).toBe(true);

      // Save 2
      tab = markTabSaved(tab, 'v3');
      expect(tab.isDirty).toBe(false);

      // Edit 3 (back to v2)
      tab = updateTabContent(tab, 'v2');
      expect(tab.isDirty).toBe(true);

      // Save 3
      tab = markTabSaved(tab, 'v2');
      expect(tab.isDirty).toBe(false);
    });
  });

  describe('handleSave stale closure fix simulation', () => {
    it('demonstrates the fix: using fresh content instead of closure content', () => {
      // This test demonstrates why the fix was necessary.
      // The old handleSave captured activeTab in closure, which could be stale.
      // The fix gets fresh state from getState() and uses editor.getValue().

      // Simulate store state
      let storeState = {
        tabs: [
          {
            id: 'tab-1',
            content: 'A',
            originalContent: 'A',
            isDirty: false,
          },
        ],
        activeTabId: 'tab-1',
      };

      // Simulate a "stale closure" capturing the tab state
      const staleClosureTab = storeState.tabs[0];

      // User edits - store state updates
      storeState = {
        ...storeState,
        tabs: [
          {
            id: 'tab-1',
            content: 'B',
            originalContent: 'A',
            isDirty: true,
          },
        ],
      };

      // OLD BUG: Using stale closure tab would save "A" (old content)
      const oldBugSavedContent = staleClosureTab!.content;
      expect(oldBugSavedContent).toBe('A'); // Wrong! Should be "B"

      // FIX: Using fresh state from getState() gets correct content
      const freshTab = storeState.tabs[0];
      const fixedSavedContent = freshTab!.content;
      expect(fixedSavedContent).toBe('B'); // Correct!
    });

    it('demonstrates syncing editor content before save', () => {
      // This test demonstrates why we need to get content from editor directly.
      // The store might have stale content if onChange hasn't fired yet.

      // Simulate store state (has old content because onChange hasn't fired)
      let storeContent = 'A';

      // Editor has newer content (not yet synced to store)
      const editorContent = 'B';

      // FIX: Use editor content if available, fall back to store content
      const contentToSave = editorContent ?? storeContent;

      expect(contentToSave).toBe('B'); // Correctly saves editor content

      // Simulate syncing to store before save
      if (editorContent !== null && editorContent !== storeContent) {
        storeContent = editorContent;
      }

      // Now store is synced
      expect(storeContent).toBe('B');

      // After save, markTabSaved would set originalContent = savedContent
      // and isDirty = false (if no more changes come in)
    });
  });

  describe('edge cases', () => {
    it('should handle whitespace-only changes as dirty', () => {
      let tab = {
        content: 'hello',
        originalContent: 'hello',
        isDirty: false,
      };

      tab = updateTabContent(tab, 'hello ');
      expect(tab.isDirty).toBe(true);
    });

    it('should treat CRLF and LF line endings as equivalent (not dirty)', () => {
      let tab = {
        content: 'line1\nline2',
        originalContent: 'line1\nline2',
        isDirty: false,
      };

      // CodeMirror normalizes \r\n to \n internally, so content that only
      // differs by line endings should NOT be considered dirty.
      tab = updateTabContent(tab, 'line1\r\nline2');
      expect(tab.isDirty).toBe(false);
    });

    it('should handle unicode content correctly', () => {
      let tab = {
        content: '你好世界',
        originalContent: '你好世界',
        isDirty: false,
      };

      tab = updateTabContent(tab, '你好宇宙');
      expect(tab.isDirty).toBe(true);

      tab = markTabSaved(tab, '你好宇宙');
      expect(tab.isDirty).toBe(false);
    });

    it('should handle very large content efficiently', () => {
      // Generate a large string (1MB)
      const largeOriginal = 'x'.repeat(1024 * 1024);
      const largeModified = largeOriginal + 'y';

      let tab = {
        content: largeOriginal,
        originalContent: largeOriginal,
        isDirty: false,
      };

      tab = updateTabContent(tab, largeModified);

      expect(tab.isDirty).toBe(true);
    });
  });
});
