/**
 * Unit tests for MobileTerminalShortcuts component
 * These tests verify the terminal shortcuts bar functionality and responsive behavior
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MobileTerminalShortcuts } from '../../../src/components/views/terminal-view/mobile-terminal-shortcuts.tsx';
import type { StickyModifier } from '../../../src/components/views/terminal-view/sticky-modifier-keys.tsx';

// Mock the StickyModifierKeys component
vi.mock('../../../src/components/views/terminal-view/sticky-modifier-keys.tsx', () => ({
  StickyModifierKeys: ({
    activeModifier,
    onModifierChange,
    isConnected,
  }: {
    activeModifier: StickyModifier;
    onModifierChange: (m: StickyModifier) => void;
    isConnected: boolean;
  }) => (
    <div
      data-testid="sticky-modifier-keys"
      data-modifier={activeModifier}
      data-connected={isConnected}
    >
      <button onClick={() => onModifierChange('ctrl')} data-testid="ctrl-btn">
        Ctrl
      </button>
    </div>
  ),
}));

/**
 * Helper to get arrow button by direction using the Lucide icon class
 */
function getArrowButton(direction: 'up' | 'down' | 'left' | 'right'): HTMLButtonElement | null {
  const iconClass = `lucide-arrow-${direction}`;
  const svg = document.querySelector(`svg.${iconClass}`);
  return (svg?.closest('button') as HTMLButtonElement) || null;
}

/**
 * Creates default props for MobileTerminalShortcuts component
 */
function createDefaultProps(overrides: Partial<typeof defaultProps> = {}) {
  return {
    ...defaultProps,
    ...overrides,
  };
}

const defaultProps = {
  onSendInput: vi.fn(),
  isConnected: true,
  activeModifier: null as StickyModifier,
  onModifierChange: vi.fn(),
  onCopy: vi.fn(),
  onPaste: vi.fn(),
  onSelectAll: vi.fn(),
  onToggleSelectMode: vi.fn(),
  isSelectMode: false,
};

describe('MobileTerminalShortcuts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render the shortcuts bar with all buttons', () => {
      render(<MobileTerminalShortcuts {...createDefaultProps()} />);

      // Check for collapse button
      expect(screen.getByTitle('Hide shortcuts')).toBeInTheDocument();

      // Check for sticky modifier keys
      expect(screen.getByTestId('sticky-modifier-keys')).toBeInTheDocument();

      // Check for special keys
      expect(screen.getByText('Esc')).toBeInTheDocument();
      expect(screen.getByText('Tab')).toBeInTheDocument();

      // Check for Ctrl shortcuts
      expect(screen.getByText('^C')).toBeInTheDocument();
      expect(screen.getByText('^Z')).toBeInTheDocument();
      expect(screen.getByText('^B')).toBeInTheDocument();

      // Check for arrow buttons via SVG icons
      expect(getArrowButton('left')).not.toBeNull();
      expect(getArrowButton('down')).not.toBeNull();
      expect(getArrowButton('up')).not.toBeNull();
      expect(getArrowButton('right')).not.toBeNull();

      // Check for navigation keys
      expect(screen.getByText('Del')).toBeInTheDocument();
      expect(screen.getByText('Home')).toBeInTheDocument();
      expect(screen.getByText('End')).toBeInTheDocument();
    });

    it('should render clipboard action buttons when callbacks provided', () => {
      render(<MobileTerminalShortcuts {...createDefaultProps()} />);

      expect(screen.getByTitle('Select text')).toBeInTheDocument();
      expect(screen.getByTitle('Select all')).toBeInTheDocument();
      expect(screen.getByTitle('Copy selection')).toBeInTheDocument();
      expect(screen.getByTitle('Paste from clipboard')).toBeInTheDocument();
    });

    it('should not render clipboard buttons when callbacks are not provided', () => {
      render(
        <MobileTerminalShortcuts
          {...createDefaultProps({
            onCopy: undefined,
            onPaste: undefined,
            onSelectAll: undefined,
            onToggleSelectMode: undefined,
          })}
        />
      );

      expect(screen.queryByTitle('Select text')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Select all')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Copy selection')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Paste from clipboard')).not.toBeInTheDocument();
    });

    it('should render in collapsed state when collapsed', () => {
      render(<MobileTerminalShortcuts {...createDefaultProps()} />);

      // Click collapse button
      fireEvent.click(screen.getByTitle('Hide shortcuts'));

      // Should show collapsed view
      expect(screen.getByText('Shortcuts')).toBeInTheDocument();
      expect(screen.getByTitle('Show shortcuts')).toBeInTheDocument();
      expect(screen.queryByText('Esc')).not.toBeInTheDocument();
    });

    it('should expand when clicking show shortcuts button', () => {
      render(<MobileTerminalShortcuts {...createDefaultProps()} />);

      // Collapse first
      fireEvent.click(screen.getByTitle('Hide shortcuts'));
      expect(screen.queryByText('Esc')).not.toBeInTheDocument();

      // Expand
      fireEvent.click(screen.getByTitle('Show shortcuts'));
      expect(screen.getByText('Esc')).toBeInTheDocument();
    });
  });

  describe('Special Keys', () => {
    it('should send Escape key when Esc button is pressed', () => {
      const onSendInput = vi.fn();
      render(<MobileTerminalShortcuts {...createDefaultProps({ onSendInput })} />);

      const escButton = screen.getByText('Esc');
      fireEvent.pointerDown(escButton);

      expect(onSendInput).toHaveBeenCalledWith('\x1b');
    });

    it('should send Tab key when Tab button is pressed', () => {
      const onSendInput = vi.fn();
      render(<MobileTerminalShortcuts {...createDefaultProps({ onSendInput })} />);

      const tabButton = screen.getByText('Tab');
      fireEvent.pointerDown(tabButton);

      expect(onSendInput).toHaveBeenCalledWith('\t');
    });

    it('should send Delete key when Del button is pressed', () => {
      const onSendInput = vi.fn();
      render(<MobileTerminalShortcuts {...createDefaultProps({ onSendInput })} />);

      const delButton = screen.getByText('Del');
      fireEvent.pointerDown(delButton);

      expect(onSendInput).toHaveBeenCalledWith('\x1b[3~');
    });

    it('should send Home key when Home button is pressed', () => {
      const onSendInput = vi.fn();
      render(<MobileTerminalShortcuts {...createDefaultProps({ onSendInput })} />);

      const homeButton = screen.getByText('Home');
      fireEvent.pointerDown(homeButton);

      expect(onSendInput).toHaveBeenCalledWith('\x1b[H');
    });

    it('should send End key when End button is pressed', () => {
      const onSendInput = vi.fn();
      render(<MobileTerminalShortcuts {...createDefaultProps({ onSendInput })} />);

      const endButton = screen.getByText('End');
      fireEvent.pointerDown(endButton);

      expect(onSendInput).toHaveBeenCalledWith('\x1b[F');
    });
  });

  describe('Ctrl Key Shortcuts', () => {
    it('should send Ctrl+C when ^C button is pressed', () => {
      const onSendInput = vi.fn();
      render(<MobileTerminalShortcuts {...createDefaultProps({ onSendInput })} />);

      const ctrlCButton = screen.getByText('^C');
      fireEvent.pointerDown(ctrlCButton);

      expect(onSendInput).toHaveBeenCalledWith('\x03');
    });

    it('should send Ctrl+Z when ^Z button is pressed', () => {
      const onSendInput = vi.fn();
      render(<MobileTerminalShortcuts {...createDefaultProps({ onSendInput })} />);

      const ctrlZButton = screen.getByText('^Z');
      fireEvent.pointerDown(ctrlZButton);

      expect(onSendInput).toHaveBeenCalledWith('\x1a');
    });

    it('should send Ctrl+B when ^B button is pressed', () => {
      const onSendInput = vi.fn();
      render(<MobileTerminalShortcuts {...createDefaultProps({ onSendInput })} />);

      const ctrlBButton = screen.getByText('^B');
      fireEvent.pointerDown(ctrlBButton);

      expect(onSendInput).toHaveBeenCalledWith('\x02');
    });
  });

  describe('Arrow Keys', () => {
    it('should send arrow up key when pressed', () => {
      const onSendInput = vi.fn();
      render(<MobileTerminalShortcuts {...createDefaultProps({ onSendInput })} />);

      const upButton = getArrowButton('up');
      expect(upButton).not.toBeNull();
      fireEvent.pointerDown(upButton!);

      expect(onSendInput).toHaveBeenCalledWith('\x1b[A');
    });

    it('should send arrow down key when pressed', () => {
      const onSendInput = vi.fn();
      render(<MobileTerminalShortcuts {...createDefaultProps({ onSendInput })} />);

      const downButton = getArrowButton('down');
      expect(downButton).not.toBeNull();
      fireEvent.pointerDown(downButton!);

      expect(onSendInput).toHaveBeenCalledWith('\x1b[B');
    });

    it('should send arrow right key when pressed', () => {
      const onSendInput = vi.fn();
      render(<MobileTerminalShortcuts {...createDefaultProps({ onSendInput })} />);

      const rightButton = getArrowButton('right');
      expect(rightButton).not.toBeNull();
      fireEvent.pointerDown(rightButton!);

      expect(onSendInput).toHaveBeenCalledWith('\x1b[C');
    });

    it('should send arrow left key when pressed', () => {
      const onSendInput = vi.fn();
      render(<MobileTerminalShortcuts {...createDefaultProps({ onSendInput })} />);

      const leftButton = getArrowButton('left');
      expect(leftButton).not.toBeNull();
      fireEvent.pointerDown(leftButton!);

      expect(onSendInput).toHaveBeenCalledWith('\x1b[D');
    });

    it('should send initial arrow key immediately on press', () => {
      const onSendInput = vi.fn();
      render(<MobileTerminalShortcuts {...createDefaultProps({ onSendInput })} />);

      const upButton = getArrowButton('up');
      expect(upButton).not.toBeNull();
      fireEvent.pointerDown(upButton!);

      // Initial press should send immediately
      expect(onSendInput).toHaveBeenCalledTimes(1);
      expect(onSendInput).toHaveBeenCalledWith('\x1b[A');

      // Release the button - should not send more
      fireEvent.pointerUp(upButton!);
      expect(onSendInput).toHaveBeenCalledTimes(1);
    });

    it('should stop repeating when pointer leaves button', () => {
      const onSendInput = vi.fn();
      render(<MobileTerminalShortcuts {...createDefaultProps({ onSendInput })} />);

      const upButton = getArrowButton('up');
      expect(upButton).not.toBeNull();

      // Press and release via pointer leave
      fireEvent.pointerDown(upButton!);
      expect(onSendInput).toHaveBeenCalledTimes(1);

      // Pointer leaves - should clear repeat timers
      fireEvent.pointerLeave(upButton!);

      // Only the initial press should have been sent
      expect(onSendInput).toHaveBeenCalledTimes(1);
    });
  });

  describe('Clipboard Actions', () => {
    it('should call onCopy when copy button is pressed', () => {
      const onCopy = vi.fn();
      render(<MobileTerminalShortcuts {...createDefaultProps({ onCopy })} />);

      const copyButton = screen.getByTitle('Copy selection');
      fireEvent.pointerDown(copyButton);

      expect(onCopy).toHaveBeenCalledTimes(1);
    });

    it('should call onPaste when paste button is pressed', () => {
      const onPaste = vi.fn();
      render(<MobileTerminalShortcuts {...createDefaultProps({ onPaste })} />);

      const pasteButton = screen.getByTitle('Paste from clipboard');
      fireEvent.pointerDown(pasteButton);

      expect(onPaste).toHaveBeenCalledTimes(1);
    });

    it('should call onSelectAll when select all button is pressed', () => {
      const onSelectAll = vi.fn();
      render(<MobileTerminalShortcuts {...createDefaultProps({ onSelectAll })} />);

      const selectAllButton = screen.getByTitle('Select all');
      fireEvent.pointerDown(selectAllButton);

      expect(onSelectAll).toHaveBeenCalledTimes(1);
    });

    it('should call onToggleSelectMode when select mode button is pressed', () => {
      const onToggleSelectMode = vi.fn();
      render(<MobileTerminalShortcuts {...createDefaultProps({ onToggleSelectMode })} />);

      const selectModeButton = screen.getByTitle('Select text');
      fireEvent.pointerDown(selectModeButton);

      expect(onToggleSelectMode).toHaveBeenCalledTimes(1);
    });

    it('should show active state when in select mode', () => {
      render(<MobileTerminalShortcuts {...createDefaultProps({ isSelectMode: true })} />);

      const selectModeButton = screen.getByTitle('Exit select mode');
      expect(selectModeButton).toBeInTheDocument();
    });
  });

  describe('Connection State', () => {
    it('should disable all buttons when not connected', () => {
      const onSendInput = vi.fn();
      render(
        <MobileTerminalShortcuts {...createDefaultProps({ isConnected: false, onSendInput })} />
      );

      // All shortcut buttons should not send input when disabled
      const escButton = screen.getByText('Esc');
      fireEvent.pointerDown(escButton);

      expect(onSendInput).not.toHaveBeenCalled();

      // Arrow keys should also be disabled
      const upButton = getArrowButton('up');
      expect(upButton).not.toBeNull();
      fireEvent.pointerDown(upButton!);

      expect(onSendInput).not.toHaveBeenCalled();
    });

    it('should pass connected state to StickyModifierKeys', () => {
      render(<MobileTerminalShortcuts {...createDefaultProps({ isConnected: false })} />);

      const stickyKeys = screen.getByTestId('sticky-modifier-keys');
      expect(stickyKeys).toHaveAttribute('data-connected', 'false');
    });
  });

  describe('Sticky Modifier Integration', () => {
    it('should pass active modifier to StickyModifierKeys', () => {
      render(<MobileTerminalShortcuts {...createDefaultProps({ activeModifier: 'ctrl' })} />);

      const stickyKeys = screen.getByTestId('sticky-modifier-keys');
      expect(stickyKeys).toHaveAttribute('data-modifier', 'ctrl');
    });

    it('should call onModifierChange when modifier is changed', () => {
      const onModifierChange = vi.fn();
      render(<MobileTerminalShortcuts {...createDefaultProps({ onModifierChange })} />);

      const ctrlBtn = screen.getByTestId('ctrl-btn');
      fireEvent.click(ctrlBtn);

      expect(onModifierChange).toHaveBeenCalledWith('ctrl');
    });
  });
});
