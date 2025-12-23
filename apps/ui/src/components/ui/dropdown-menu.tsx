import * as React from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { Check, ChevronRight, Circle } from 'lucide-react';

import { cn } from '@/lib/utils';

// Type-safe wrappers for Radix UI primitives (React 19 compatibility)
const DropdownMenuTriggerPrimitive =
  DropdownMenuPrimitive.Trigger as React.ForwardRefExoticComponent<
    React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Trigger> & {
      children?: React.ReactNode;
      asChild?: boolean;
    } & React.RefAttributes<HTMLButtonElement>
  >;

const DropdownMenuSubTriggerPrimitive =
  DropdownMenuPrimitive.SubTrigger as React.ForwardRefExoticComponent<
    React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger> & {
      children?: React.ReactNode;
      className?: string;
    } & React.RefAttributes<HTMLDivElement>
  >;

const DropdownMenuRadioGroupPrimitive =
  DropdownMenuPrimitive.RadioGroup as React.ForwardRefExoticComponent<
    React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioGroup> & {
      children?: React.ReactNode;
    } & React.RefAttributes<HTMLDivElement>
  >;

const DropdownMenuItemPrimitive = DropdownMenuPrimitive.Item as React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    children?: React.ReactNode;
    className?: string;
  } & React.HTMLAttributes<HTMLDivElement> &
    React.RefAttributes<HTMLDivElement>
>;

const DropdownMenuRadioItemPrimitive =
  DropdownMenuPrimitive.RadioItem as React.ForwardRefExoticComponent<
    React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem> & {
      children?: React.ReactNode;
      className?: string;
    } & React.HTMLAttributes<HTMLDivElement> &
      React.RefAttributes<HTMLDivElement>
  >;

const DropdownMenuLabelPrimitive = DropdownMenuPrimitive.Label as React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & {
    children?: React.ReactNode;
    className?: string;
  } & React.RefAttributes<HTMLDivElement>
>;

const DropdownMenuCheckboxItemPrimitive =
  DropdownMenuPrimitive.CheckboxItem as React.ForwardRefExoticComponent<
    React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem> & {
      children?: React.ReactNode;
      className?: string;
    } & React.RefAttributes<HTMLDivElement>
  >;

const DropdownMenuItemIndicatorPrimitive =
  DropdownMenuPrimitive.ItemIndicator as React.ForwardRefExoticComponent<
    React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.ItemIndicator> & {
      children?: React.ReactNode;
    } & React.RefAttributes<HTMLSpanElement>
  >;

const DropdownMenuSeparatorPrimitive =
  DropdownMenuPrimitive.Separator as React.ForwardRefExoticComponent<
    React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator> & {
      className?: string;
    } & React.RefAttributes<HTMLDivElement>
  >;

const DropdownMenu = DropdownMenuPrimitive.Root;

function DropdownMenuTrigger({
  children,
  asChild,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger> & {
  children?: React.ReactNode;
  asChild?: boolean;
}) {
  return (
    <DropdownMenuTriggerPrimitive asChild={asChild} {...props}>
      {children}
    </DropdownMenuTriggerPrimitive>
  );
}

const DropdownMenuGroup = DropdownMenuPrimitive.Group;

const DropdownMenuPortal = DropdownMenuPrimitive.Portal;

const DropdownMenuSub = DropdownMenuPrimitive.Sub;

function DropdownMenuRadioGroup({
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup> & { children?: React.ReactNode }) {
  return <DropdownMenuRadioGroupPrimitive {...props}>{children}</DropdownMenuRadioGroupPrimitive>;
}

const DropdownMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger> & {
    inset?: boolean;
    children?: React.ReactNode;
    className?: string;
  }
>(({ className, inset, children, ...props }, ref) => (
  <DropdownMenuSubTriggerPrimitive
    ref={ref}
    className={cn(
      'flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent data-[state=open]:bg-accent hover:bg-accent',
      inset && 'pl-8',
      className
    )}
    {...props}
  >
    {children}
    <ChevronRight className="ml-auto h-4 w-4" />
  </DropdownMenuSubTriggerPrimitive>
));
DropdownMenuSubTrigger.displayName = DropdownMenuPrimitive.SubTrigger.displayName;

const DropdownMenuSubContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent> & {
    className?: string;
  }
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.SubContent
      ref={ref}
      className={cn(
        'z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
        className
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));
DropdownMenuSubContent.displayName = DropdownMenuPrimitive.SubContent.displayName;

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content> & {
    className?: string;
  }
>(({ className, sideOffset = 4, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 min-w-[8rem] overflow-hidden rounded-lg border border-white/10 bg-popover/80 p-1 text-popover-foreground shadow-xl backdrop-blur-xl',
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
        className
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;

const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    inset?: boolean;
    children?: React.ReactNode;
  } & React.HTMLAttributes<HTMLDivElement>
>(({ className, inset, children, ...props }, ref) => (
  <DropdownMenuItemPrimitive
    ref={ref}
    className={cn(
      'relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed hover:bg-accent',
      inset && 'pl-8',
      className
    )}
    {...props}
  >
    {children}
  </DropdownMenuItemPrimitive>
));
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;

const DropdownMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem> & {
    className?: string;
    children?: React.ReactNode;
  }
>(({ className, children, checked, ...props }, ref) => (
  <DropdownMenuCheckboxItemPrimitive
    ref={ref}
    className={cn(
      'relative flex cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed hover:bg-accent',
      className
    )}
    checked={checked}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <DropdownMenuItemIndicatorPrimitive>
        <Check className="h-4 w-4" />
      </DropdownMenuItemIndicatorPrimitive>
    </span>
    {children}
  </DropdownMenuCheckboxItemPrimitive>
));
DropdownMenuCheckboxItem.displayName = DropdownMenuPrimitive.CheckboxItem.displayName;

const DropdownMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem> & {
    children?: React.ReactNode;
  } & React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <DropdownMenuRadioItemPrimitive
    ref={ref}
    className={cn(
      'relative flex cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed hover:bg-accent',
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <DropdownMenuItemIndicatorPrimitive>
        <Circle className="h-2 w-2 fill-current" />
      </DropdownMenuItemIndicatorPrimitive>
    </span>
    {children}
  </DropdownMenuRadioItemPrimitive>
));
DropdownMenuRadioItem.displayName = DropdownMenuPrimitive.RadioItem.displayName;

const DropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & {
    inset?: boolean;
    children?: React.ReactNode;
    className?: string;
  }
>(({ className, inset, children, ...props }, ref) => (
  <DropdownMenuLabelPrimitive
    ref={ref}
    className={cn('px-2 py-1.5 text-sm font-semibold', inset && 'pl-8', className)}
    {...props}
  >
    {children}
  </DropdownMenuLabelPrimitive>
));
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName;

const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator> & {
    className?: string;
  }
>(({ className, ...props }, ref) => (
  <DropdownMenuSeparatorPrimitive
    ref={ref}
    className={cn('-mx-1 my-1 h-px bg-muted', className)}
    {...props}
  />
));
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName;

const DropdownMenuShortcut = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span
      className={cn('ml-auto text-xs tracking-widest text-brand-400/70', className)}
      {...props}
    />
  );
};
DropdownMenuShortcut.displayName = 'DropdownMenuShortcut';

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
};
