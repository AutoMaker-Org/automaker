import type { ComponentType, ComponentProps } from 'react';
import { Terminal } from 'lucide-react';

type IconProps = ComponentProps<'svg'>;
type IconComponent = ComponentType<IconProps>;

/**
 * iTerm2 logo icon
 */
export function ITerm2Icon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M2.586 0a2.56 2.56 0 00-2.56 2.56v18.88A2.56 2.56 0 002.586 24h18.88a2.56 2.56 0 002.56-2.56V2.56A2.56 2.56 0 0021.466 0H2.586zm8.143 4.027h2.543v15.946h-2.543V4.027zm-3.816 0h2.544v15.946H6.913V4.027zm7.633 0h2.543v15.946h-2.543V4.027z" />
    </svg>
  );
}

/**
 * Warp terminal logo icon
 */
export function WarpIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M9.2 4.8L7.6 7.6 4.8 5.6l1.6-2.8L9.2 4.8zm5.6 0l1.6 2.8 2.8-2-1.6-2.8-2.8 2zM2.4 12l2.8 1.6L3.6 16 .8 14.4 2.4 12zm19.2 0l1.6 2.4-2.8 1.6-1.6-2.4 2.8-1.6zM7.6 16.4l1.6 2.8-2.8 2-1.6-2.8 2.8-2zm8.8 0l2.8 2-1.6 2.8-2.8-2 1.6-2.8zM12 0L8.4 2 12 4l3.6-2L12 0zm0 20l-3.6 2 3.6 2 3.6-2-3.6-2z" />
    </svg>
  );
}

/**
 * Ghostty terminal logo icon
 */
export function GhosttyIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M12 2C6.48 2 2 6.48 2 12v8c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2v-8c0-5.52-4.48-10-10-10zm-3.5 12a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm7 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3zM12 19c-1.5 0-3-.5-4-1.5v-1c2 1 6 1 8 0v1c-1 1-2.5 1.5-4 1.5z" />
    </svg>
  );
}

/**
 * Alacritty terminal logo icon
 */
export function AlacrittyIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M12 0L1.608 21.6h3.186l1.46-3.032h11.489l1.46 3.032h3.189L12 0zm0 7.29l3.796 7.882H8.204L12 7.29z" />
    </svg>
  );
}

/**
 * WezTerm terminal logo icon
 */
export function WezTermIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M2 4h20v16H2V4zm2 2v12h16V6H4zm2 2h12v2H6V8zm0 4h8v2H6v-2z" />
    </svg>
  );
}

/**
 * Kitty terminal logo icon
 */
export function KittyIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M3.5 7.5L1 5V2.5L3.5 5V7.5zM20.5 7.5L23 5V2.5L20.5 5V7.5zM12 4L6 8v8l6 4 6-4V8l-6-4zm0 2l4 2.67v5.33L12 16.67 8 14V8.67L12 6z" />
    </svg>
  );
}

/**
 * Hyper terminal logo icon
 */
export function HyperIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M11.857 23.995v-7.125H6.486l5.765-10.856-.363-1.072L7.803.001 0 12.191h5.75L0 23.995h11.857zm.286 0h5.753l5.679-11.804h-5.679l5.679-11.804L17.896.388l-5.753 11.803h5.753L12.143 24z" />
    </svg>
  );
}

/**
 * Tabby terminal logo icon
 */
export function TabbyIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M12 2L4 6v12l8 4 8-4V6l-8-4zm0 2l6 3v10l-6 3-6-3V7l6-3z" />
    </svg>
  );
}

/**
 * Rio terminal logo icon
 */
export function RioIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z" />
    </svg>
  );
}

/**
 * Windows Terminal logo icon
 */
export function WindowsTerminalIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M8.165 6L0 9.497v5.006L8.165 18l.413-.206v-4.025L3.197 12l5.381-1.769V6.206L8.165 6zm7.67 0l-.413.206v4.025L20.803 12l-5.381 1.769v4.025l.413.206L24 14.503V9.497L15.835 6z" />
    </svg>
  );
}

/**
 * PowerShell logo icon
 */
export function PowerShellIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M23.181 2.974c.568 0 .923.463.792 1.035l-3.659 15.982c-.13.572-.697 1.035-1.265 1.035H.819c-.568 0-.923-.463-.792-1.035L3.686 4.009c.13-.572.697-1.035 1.265-1.035h18.23zM8.958 16.677c0 .334.276.611.611.611h3.673a.615.615 0 00.611-.611.615.615 0 00-.611-.611h-3.673a.615.615 0 00-.611.611zm5.126-7.016L9.025 14.72c-.241.241-.241.63 0 .872.241.241.63.241.872 0l5.059-5.059c.241-.241.241-.63 0-.872l-5.059-5.059c-.241-.241-.63-.241-.872 0-.241.241-.241.63 0 .872l5.059 5.059c-.334.334-.334.334 0 0z" />
    </svg>
  );
}

/**
 * Command Prompt (cmd) logo icon
 */
export function CmdIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M2 4h20v16H2V4zm2 2v12h16V6H4zm2.5 1.5l3 3-3 3L5 12l3-3zm5.5 5h6v1.5h-6V12z" />
    </svg>
  );
}

/**
 * Git Bash logo icon
 */
export function GitBashIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M23.546 10.93L13.067.452c-.604-.603-1.582-.603-2.188 0L8.708 2.627l2.76 2.76c.645-.215 1.379-.07 1.889.441.516.515.658 1.258.438 1.9l2.658 2.66c.645-.223 1.387-.078 1.9.435.721.72.721 1.884 0 2.604-.719.719-1.881.719-2.6 0-.539-.541-.674-1.337-.404-1.996L12.86 8.955v6.525c.176.086.342.203.488.348.713.721.713 1.883 0 2.6-.719.721-1.889.721-2.609 0-.719-.719-.719-1.879 0-2.598.182-.18.387-.316.605-.406V8.835c-.217-.091-.424-.222-.6-.401-.545-.545-.676-1.342-.396-2.009L7.636 3.7.45 10.881c-.6.605-.6 1.584 0 2.189l10.48 10.477c.604.604 1.582.604 2.186 0l10.43-10.43c.605-.603.605-1.582 0-2.187" />
    </svg>
  );
}

/**
 * GNOME Terminal logo icon
 */
export function GnomeTerminalIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M2 4a2 2 0 00-2 2v12a2 2 0 002 2h20a2 2 0 002-2V6a2 2 0 00-2-2H2zm0 2h20v12H2V6zm2 2v2h2V8H4zm4 0v2h12V8H8zm-4 4v2h2v-2H4zm4 0v2h8v-2H8z" />
    </svg>
  );
}

/**
 * Konsole logo icon
 */
export function KonsoleIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M3 3h18a2 2 0 012 2v14a2 2 0 01-2 2H3a2 2 0 01-2-2V5a2 2 0 012-2zm0 2v14h18V5H3zm2 2l4 4-4 4V7zm6 6h8v2h-8v-2z" />
    </svg>
  );
}

/**
 * macOS Terminal logo icon
 */
export function MacOSTerminalIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M3 4a2 2 0 00-2 2v12a2 2 0 002 2h18a2 2 0 002-2V6a2 2 0 00-2-2H3zm0 2h18v12H3V6zm2 2l5 4-5 4V8zm7 6h7v2h-7v-2z" />
    </svg>
  );
}

/**
 * Get the appropriate icon component for a terminal ID
 */
export function getTerminalIcon(terminalId: string): IconComponent {
  const terminalIcons: Record<string, IconComponent> = {
    iterm2: ITerm2Icon,
    warp: WarpIcon,
    ghostty: GhosttyIcon,
    alacritty: AlacrittyIcon,
    wezterm: WezTermIcon,
    kitty: KittyIcon,
    hyper: HyperIcon,
    tabby: TabbyIcon,
    rio: RioIcon,
    'windows-terminal': WindowsTerminalIcon,
    powershell: PowerShellIcon,
    cmd: CmdIcon,
    'git-bash': GitBashIcon,
    'gnome-terminal': GnomeTerminalIcon,
    konsole: KonsoleIcon,
    'terminal-macos': MacOSTerminalIcon,
    // Linux terminals - use generic terminal icon
    'xfce4-terminal': Terminal,
    tilix: Terminal,
    terminator: Terminal,
    foot: Terminal,
    xterm: Terminal,
  };

  return terminalIcons[terminalId] ?? Terminal;
}
