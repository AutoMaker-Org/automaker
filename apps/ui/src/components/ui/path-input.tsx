import { useEffect, Fragment, FocusEvent, KeyboardEvent, MouseEvent } from 'react';
import { useState, useRef, useCallback, useMemo } from 'react';
import { Home, ArrowLeft, Pencil, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { cn } from '@/lib/utils';

interface BreadcrumbSegment {
  name: string;
  path: string;
  isLast: boolean;
}

function parseBreadcrumbs(path: string): BreadcrumbSegment[] {
  if (!path) return [];

  // Handle root path on Unix-like systems
  if (path === '/') {
    return [{ name: '/', path: '/', isLast: true }];
  }

  const segments = path.split(/[/\\]/).filter(Boolean);
  const isWindows = segments[0]?.includes(':');

  return segments.map((segment, index) => {
    let fullPath: string;

    if (isWindows) {
      const pathParts = segments.slice(0, index + 1);
      if (index === 0) {
        fullPath = `${pathParts[0]}\\`;
      } else {
        fullPath = pathParts.join('\\');
      }
    } else {
      fullPath = '/' + segments.slice(0, index + 1).join('/');
    }

    return {
      name: segment,
      path: fullPath,
      isLast: index === segments.length - 1,
    };
  });
}

interface PathInputProps {
  /** Current resolved path */
  currentPath: string;
  /** Parent path for back navigation (null if at root) */
  parentPath: string | null;
  /** Whether the component is in a loading state */
  loading?: boolean;
  /** Whether there's an error (shows input mode and red border when true) */
  error?: boolean;
  /** Placeholder text for the input field */
  placeholder?: string;
  /** Called when user navigates to a path (via breadcrumb click, enter key, or navigation buttons) */
  onNavigate: (path: string) => void;
  /** Called when user clicks home button (navigates to home directory) */
  onHome: () => void;
  /** Additional className for the container */
  className?: string;
}

function PathInput({
  currentPath,
  parentPath,
  loading = false,
  error,
  placeholder = 'Paste or type a full path (e.g., /home/user/projects/myapp)',
  onNavigate,
  onHome,
  className,
}: PathInputProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [pathInput, setPathInput] = useState(currentPath);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync pathInput with currentPath when it changes externally
  useEffect(() => {
    if (!isEditing) {
      setPathInput(currentPath);
    }
  }, [currentPath, isEditing]);

  // Focus input when error occurs or entering edit mode
  useEffect(() => {
    if ((error || isEditing) && inputRef.current) {
      inputRef.current.focus();
      if (error) {
        inputRef.current.select();
      }
    }
  }, [error, isEditing]);

  const handleGoToParent = useCallback(() => {
    if (parentPath) {
      onNavigate(parentPath);
    }
  }, [parentPath, onNavigate]);

  const handleBreadcrumbClick = useCallback(
    (path: string) => {
      onNavigate(path);
    },
    [onNavigate]
  );

  const handleStartEditing = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleInputBlur = useCallback(
    (e: FocusEvent) => {
      // Check if focus is moving to another element within this component
      if (containerRef.current?.contains(e.relatedTarget)) {
        return;
      }
      if (pathInput !== currentPath) {
        setPathInput(currentPath);
      }
      setIsEditing(false);
    },
    [pathInput, currentPath]
  );

  const handleGoToPath = useCallback(() => {
    const trimmedPath = pathInput.trim();
    if (trimmedPath) {
      onNavigate(trimmedPath);
      setIsEditing(false);
    }
  }, [pathInput, onNavigate]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleGoToPath();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setPathInput(currentPath);
        setIsEditing(false);
        inputRef.current?.blur();
      }
    },
    [handleGoToPath, currentPath]
  );

  // Handle click on the path container to start editing
  const handleContainerClick = useCallback(
    (e: MouseEvent) => {
      // Don't trigger if clicking on a button or already editing
      if (
        isEditing ||
        (e.target as HTMLElement).closest('button') ||
        (e.target as HTMLElement).closest('a')
      ) {
        return;
      }
      setIsEditing(true);
    },
    [isEditing]
  );

  const breadcrumbs = useMemo(() => parseBreadcrumbs(currentPath), [currentPath]);

  const showBreadcrumbs = currentPath && !isEditing && !loading && !error;

  return (
    <div
      ref={containerRef}
      className={cn('flex items-center gap-2', className)}
      role="navigation"
      aria-label="Path navigation"
    >
      {/* Navigation buttons */}
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={onHome}
          className="h-7 w-7"
          disabled={loading}
          aria-label="Go to home directory"
        >
          <Home className="w-4 h-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={handleGoToParent}
          className="h-7 w-7"
          disabled={loading || !parentPath}
          aria-label="Go to parent directory"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
      </div>

      {/* Path display / input */}
      <div
        onClick={handleContainerClick}
        className={cn(
          'flex-1 flex items-center gap-2 min-w-0 h-8 px-3 rounded-md border bg-background/50 transition-colors',
          error
            ? 'border-destructive focus-within:border-destructive'
            : 'border-input focus-within:border-ring focus-within:ring-1 focus-within:ring-ring',
          !isEditing && !error && 'cursor-text hover:border-ring/50'
        )}
      >
        {showBreadcrumbs ? (
          <>
            <Breadcrumb className="flex-1 min-w-0 overflow-hidden">
              <BreadcrumbList className="flex-nowrap overflow-x-auto scrollbar-none">
                {breadcrumbs.map((crumb) => (
                  <Fragment key={crumb.path}>
                    <BreadcrumbItem className="shrink-0">
                      {crumb.isLast ? (
                        <BreadcrumbPage className="font-mono text-xs font-medium truncate max-w-[200px]">
                          {crumb.name}
                        </BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            handleBreadcrumbClick(crumb.path);
                          }}
                          className="font-mono text-xs text-muted-foreground hover:text-foreground transition-colors truncate max-w-[150px]"
                        >
                          {crumb.name}
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                    {!crumb.isLast && <BreadcrumbSeparator className="[&>svg]:size-3.5 shrink-0" />}
                  </Fragment>
                ))}
              </BreadcrumbList>
            </Breadcrumb>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleStartEditing}
              className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="Edit path"
            >
              <Pencil className="w-3.5 h-3.5" />
            </Button>
          </>
        ) : (
          <>
            <Input
              ref={inputRef}
              type="text"
              placeholder={placeholder}
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleInputBlur}
              className="flex-1 font-mono text-xs h-7 px-0 border-0 shadow-none focus-visible:ring-0 bg-transparent"
              data-testid="path-input"
              disabled={loading}
              aria-label="Path input"
              aria-invalid={error}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={handleGoToPath}
              disabled={!pathInput.trim() || loading}
              className="h-6 w-6 shrink-0"
              aria-label="Go to path"
            >
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export { PathInput, parseBreadcrumbs };
export type { PathInputProps, BreadcrumbSegment };
