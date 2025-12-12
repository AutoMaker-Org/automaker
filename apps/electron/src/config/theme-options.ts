import {
  type LucideIcon,
  Atom,
  Cat,
  Eclipse,
  Flame,
  Ghost,
  Moon,
  Radio,
  Snowflake,
  Sparkles,
  Sun,
  Terminal,
  Trees,
} from "lucide-react";
import { Theme } from "@/components/views/settings-view/shared/types";

export interface ThemeOption {
  value: Theme;
  label: string;
  Icon: LucideIcon;
  testId: string;
}

export const themeOptions: ReadonlyArray<ThemeOption> = [
  { value: "dark", label: "Dark", Icon: Moon, testId: "dark-mode-button" },
  { value: "light", label: "Light", Icon: Sun, testId: "light-mode-button" },
  {
    value: "retro",
    label: "Retro",
    Icon: Terminal,
    testId: "retro-mode-button",
  },
  {
    value: "dracula",
    label: "Dracula",
    Icon: Ghost,
    testId: "dracula-mode-button",
  },
  {
    value: "nord",
    label: "Nord",
    Icon: Snowflake,
    testId: "nord-mode-button",
  },
  {
    value: "monokai",
    label: "Monokai",
    Icon: Flame,
    testId: "monokai-mode-button",
  },
  {
    value: "tokyonight",
    label: "Tokyo Night",
    Icon: Sparkles,
    testId: "tokyonight-mode-button",
  },
  {
    value: "solarized",
    label: "Solarized",
    Icon: Eclipse,
    testId: "solarized-mode-button",
  },
  {
    value: "gruvbox",
    label: "Gruvbox",
    Icon: Trees,
    testId: "gruvbox-mode-button",
  },
  {
    value: "catppuccin",
    label: "Catppuccin",
    Icon: Cat,
    testId: "catppuccin-mode-button",
  },
  {
    value: "onedark",
    label: "One Dark",
    Icon: Atom,
    testId: "onedark-mode-button",
  },
  {
    value: "synthwave",
    label: "Synthwave",
    Icon: Radio,
    testId: "synthwave-mode-button",
  },
];
