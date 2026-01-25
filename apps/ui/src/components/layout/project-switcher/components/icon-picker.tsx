import { useState } from 'react';
import { X, Search } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

interface IconPickerProps {
  selectedIcon: string | null;
  onSelectIcon: (icon: string | null) => void;
}

// Comprehensive list of project-related icons from Lucide
// Organized by category for easier browsing
const POPULAR_ICONS = [
  // Folders & Files
  'Folder',
  'FolderOpen',
  'FolderCode',
  'FolderGit',
  'FolderKanban',
  'FolderTree',
  'FolderInput',
  'FolderOutput',
  'FolderPlus',
  'File',
  'FileCode',
  'FileText',
  'FileJson',
  'FileImage',
  'FileVideo',
  'FileAudio',
  'FileSpreadsheet',
  'Files',
  'Archive',

  // Code & Development
  'Code',
  'Code2',
  'Braces',
  'Brackets',
  'Terminal',
  'TerminalSquare',
  'Command',
  'GitBranch',
  'GitCommit',
  'GitMerge',
  'GitPullRequest',
  'GitCompare',
  'GitFork',
  'GitHub',
  'Gitlab',
  'Bitbucket',
  'Vscode',

  // Packages & Containers
  'Package',
  'PackageSearch',
  'PackageCheck',
  'PackageX',
  'Box',
  'Boxes',
  'Container',

  // UI & Design
  'Layout',
  'LayoutGrid',
  'LayoutList',
  'LayoutDashboard',
  'LayoutTemplate',
  'Layers',
  'Layers2',
  'Layers3',
  'Blocks',
  'Component',
  'Palette',
  'Paintbrush',
  'Brush',
  'PenTool',
  'Ruler',
  'Grid',
  'Grid3x3',
  'Square',
  'RectangleHorizontal',
  'RectangleVertical',
  'Circle',

  // Tools & Settings
  'Cog',
  'Settings',
  'Settings2',
  'Wrench',
  'Hammer',
  'Screwdriver',
  'WrenchIcon',
  'Tool',
  'ScrewdriverWrench',
  'Sliders',
  'SlidersHorizontal',
  'Filter',
  'FilterX',

  // Technology & Infrastructure
  'Server',
  'ServerCrash',
  'ServerCog',
  'Database',
  'DatabaseBackup',
  'CloudUpload',
  'CloudDownload',
  'CloudOff',
  'Globe',
  'Globe2',
  'Network',
  'Wifi',
  'WifiOff',
  'Router',
  'Cpu',
  'MemoryStick',
  'HardDrive',
  'HardDriveIcon',
  'CircuitBoard',
  'Microchip',
  'Monitor',
  'MonitorSpeaker',
  'Laptop',
  'Smartphone',
  'Tablet',
  'Mouse',
  'Keyboard',
  'Headphones',
  'Printer',
  'Scanner',

  // Workflow & Process
  'Workflow',
  'Zap',
  'Rocket',
  'Flame',
  'Lightning',
  'Bolt',
  'Target',
  'Flag',
  'FlagTriangleRight',
  'CheckCircle',
  'CheckCircle2',
  'XCircle',
  'AlertCircle',
  'Info',
  'HelpCircle',
  'Clock',
  'Timer',
  'Stopwatch',
  'Calendar',
  'CalendarDays',
  'CalendarCheck',
  'CalendarClock',

  // Security & Access
  'Shield',
  'ShieldCheck',
  'ShieldAlert',
  'ShieldOff',
  'Lock',
  'Unlock',
  'Key',
  'KeyRound',
  'Eye',
  'EyeOff',
  'User',
  'Users',
  'UserCheck',
  'UserX',
  'UserPlus',
  'UserCog',

  // Business & Finance
  'Briefcase',
  'Building',
  'Building2',
  'Store',
  'ShoppingCart',
  'ShoppingBag',
  'CreditCard',
  'Wallet',
  'DollarSign',
  'Euro',
  'PoundSterling',
  'Yen',
  'Coins',
  'Receipt',
  'ChartBar',
  'ChartLine',
  'ChartPie',
  'TrendingUp',
  'TrendingDown',
  'Activity',
  'BarChart',
  'LineChart',
  'PieChart',

  // Communication & Media
  'MessageSquare',
  'MessageCircle',
  'Mail',
  'MailOpen',
  'Send',
  'Inbox',
  'Phone',
  'PhoneCall',
  'Video',
  'VideoOff',
  'Camera',
  'CameraOff',
  'Image',
  'ImageIcon',
  'Film',
  'Music',
  'Mic',
  'MicOff',
  'Volume',
  'Volume2',
  'VolumeX',
  'Radio',
  'Podcast',

  // Social & Community
  'Heart',
  'HeartHandshake',
  'Star',
  'StarOff',
  'ThumbsUp',
  'ThumbsDown',
  'Share',
  'Share2',
  'Link',
  'Link2',
  'ExternalLink',
  'AtSign',
  'Hash',
  'Hashtag',
  'Tag',
  'Tags',

  // Navigation & Location
  'Compass',
  'Map',
  'MapPin',
  'Navigation',
  'Navigation2',
  'Route',
  'Plane',
  'Car',
  'Bike',
  'Ship',
  'Train',
  'Bus',

  // Science & Education
  'FlaskConical',
  'FlaskRound',
  'Beaker',
  'TestTube',
  'TestTube2',
  'Microscope',
  'Atom',
  'Brain',
  'GraduationCap',
  'Book',
  'BookOpen',
  'BookMarked',
  'Library',
  'School',
  'University',

  // Food & Health
  'Coffee',
  'Utensils',
  'UtensilsCrossed',
  'Apple',
  'Cherry',
  'Cookie',
  'Cake',
  'Pizza',
  'Beer',
  'Wine',
  'HeartPulse',
  'Dumbbell',
  'Running',

  // Nature & Weather
  'Tree',
  'TreePine',
  'Leaf',
  'Flower',
  'Flower2',
  'Sun',
  'Moon',
  'CloudRain',
  'CloudSnow',
  'CloudLightning',
  'Droplet',
  'Wind',
  'Snowflake',
  'Umbrella',

  // Objects & Symbols
  'Puzzle',
  'PuzzleIcon',
  'Gamepad',
  'Gamepad2',
  'Dice',
  'Dice1',
  'Dice6',
  'Gem',
  'Crown',
  'Trophy',
  'Medal',
  'Award',
  'Gift',
  'GiftIcon',
  'Bell',
  'BellOff',
  'BellRing',
  'Home',
  'House',
  'DoorOpen',
  'DoorClosed',
  'Window',
  'Lightbulb',
  'LightbulbOff',
  'Candle',
  'Flashlight',
  'FlashlightOff',
  'Battery',
  'BatteryFull',
  'BatteryLow',
  'BatteryCharging',
  'Plug',
  'PlugZap',
  'Power',
  'PowerOff',

  // Arrows & Directions
  'ArrowRight',
  'ArrowLeft',
  'ArrowUp',
  'ArrowDown',
  'ArrowUpRight',
  'ArrowDownRight',
  'ArrowDownLeft',
  'ArrowUpLeft',
  'ChevronRight',
  'ChevronLeft',
  'ChevronUp',
  'ChevronDown',
  'Move',
  'MoveUp',
  'MoveDown',
  'MoveLeft',
  'MoveRight',
  'RotateCw',
  'RotateCcw',
  'RefreshCw',
  'RefreshCcw',

  // Shapes & Symbols
  'Diamond',
  'Pentagon',
  'Cross',
  'Plus',
  'Minus',
  'X',
  'Check',
  'Divide',
  'Equal',
  'Infinity',
  'Percent',

  // Miscellaneous
  'Bot',
  'Wand',
  'Wand2',
  'Magic',
  'Stars',
  'Comet',
  'Satellite',
  'SatelliteDish',
  'Radar',
  'RadarIcon',
  'Scan',
  'ScanLine',
  'QrCode',
  'Barcode',
  'ScanSearch',
  'Search',
  'SearchX',
  'ZoomIn',
  'ZoomOut',
  'Maximize',
  'Minimize',
  'Maximize2',
  'Minimize2',
  'Expand',
  'Shrink',
  'Copy',
  'CopyCheck',
  'Clipboard',
  'ClipboardCheck',
  'ClipboardCopy',
  'ClipboardList',
  'ClipboardPaste',
  'Scissors',
  'Cut',
  'FileEdit',
  'Pen',
  'Pencil',
  'Eraser',
  'Trash',
  'Trash2',
  'Delete',
  'ArchiveRestore',
  'Download',
  'Upload',
  'Save',
  'SaveAll',
  'FilePlus',
  'FileMinus',
  'FileX',
  'FileCheck',
  'FileQuestion',
  'FileWarning',
  'FileSearch',
  'FolderSearch',
  'FolderX',
  'FolderCheck',
  'FolderMinus',
  'FolderSync',
  'FolderUp',
  'FolderDown',
];

export function IconPicker({ selectedIcon, onSelectIcon }: IconPickerProps) {
  const [search, setSearch] = useState('');

  const filteredIcons = POPULAR_ICONS.filter((icon) =>
    icon.toLowerCase().includes(search.toLowerCase())
  );

  const getIconComponent = (iconName: string) => {
    return (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[
      iconName
    ];
  };

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search icons..."
          className="pl-9"
        />
      </div>

      {/* Selected Icon Display */}
      {selectedIcon && (
        <div className="flex items-center gap-2 p-2 rounded-md bg-accent/50 border border-border">
          <div className="flex items-center gap-2 flex-1">
            {(() => {
              const IconComponent = getIconComponent(selectedIcon);
              return IconComponent ? <IconComponent className="w-5 h-5 text-brand-500" /> : null;
            })()}
            <span className="text-sm font-medium">{selectedIcon}</span>
          </div>
          <button
            onClick={() => onSelectIcon(null)}
            className="p-1 hover:bg-background rounded transition-colors"
            title="Clear icon"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Icons Grid */}
      <ScrollArea className="h-96 rounded-md border">
        <div className="grid grid-cols-6 gap-1 p-2">
          {filteredIcons.map((iconName) => {
            const IconComponent = getIconComponent(iconName);
            if (!IconComponent) return null;

            const isSelected = selectedIcon === iconName;

            return (
              <button
                key={iconName}
                onClick={() => onSelectIcon(iconName)}
                className={cn(
                  'aspect-square rounded-md flex items-center justify-center',
                  'transition-all duration-150',
                  'hover:bg-accent hover:scale-110',
                  isSelected
                    ? 'bg-brand-500/20 border-2 border-brand-500'
                    : 'border border-transparent'
                )}
                title={iconName}
              >
                <IconComponent
                  className={cn('w-5 h-5', isSelected ? 'text-brand-500' : 'text-foreground')}
                />
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
