import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { XIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

// Type-safe wrappers for Radix UI primitives (React 19 compatibility)
const DialogContentPrimitive = DialogPrimitive.Content as React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    children?: React.ReactNode;
    className?: string;
  } & React.RefAttributes<HTMLDivElement>
>;

const DialogClosePrimitive = DialogPrimitive.Close as React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Close> & {
    children?: React.ReactNode;
    className?: string;
  } & React.RefAttributes<HTMLButtonElement>
>;

const DialogTitlePrimitive = DialogPrimitive.Title as React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title> & {
    children?: React.ReactNode;
    className?: string;
  } & React.RefAttributes<HTMLHeadingElement>
>;

const DialogDescriptionPrimitive = DialogPrimitive.Description as React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description> & {
    children?: React.ReactNode;
    className?: string;
    title?: string;
  } & React.RefAttributes<HTMLParagraphElement>
>;

function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

const DialogOverlayPrimitive = DialogPrimitive.Overlay as React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay> & {
    className?: string;
  } & React.RefAttributes<HTMLDivElement>
>;

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay> & {
  className?: string;
}) {
  return (
    <DialogOverlayPrimitive
      data-slot="dialog-overlay"
      className={cn(
        'fixed inset-0 z-50 bg-black/40 backdrop-blur-md',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        'duration-300',
        className
      )}
      {...props}
    />
  );
}

export type DialogContentProps = Omit<
  React.ComponentProps<typeof DialogPrimitive.Content>,
  'ref'
> & {
  showCloseButton?: boolean;
  compact?: boolean;
};

const DialogContent = React.forwardRef<HTMLDivElement, DialogContentProps>(
  ({ className, children, showCloseButton = true, compact = false, ...props }, ref) => {
    // Check if className contains a custom max-width
    const hasCustomMaxWidth = typeof className === 'string' && className.includes('max-w-');

    return (
      <DialogPortal data-slot="dialog-portal">
        <DialogOverlay />
        <DialogContentPrimitive
          ref={ref}
          data-slot="dialog-content"
          className={cn(
            'fixed top-[50%] left-[50%] z-50 translate-x-[-50%] translate-y-[-50%]',
            'flex flex-col w-full max-w-[calc(100%-2rem)] max-h-[calc(100vh-4rem)]',
            'bg-card/90 border border-white/10 rounded-2xl shadow-2xl backdrop-blur-xl',
            // Premium shadow
            'shadow-[0_40px_80px_-12px_rgba(0,0,0,0.5)]',
            // Animations - smoother with scale
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'data-[state=closed]:slide-out-to-top-[2%] data-[state=open]:slide-in-from-top-[2%]',
            'duration-300 ease-out',
            compact ? 'max-w-4xl p-4' : !hasCustomMaxWidth ? 'sm:max-w-2xl p-6' : 'p-6',
            className
          )}
          {...props}
        >
          {children}
          {showCloseButton && (
            <DialogClosePrimitive
              data-slot="dialog-close"
              className={cn(
                'absolute rounded-lg opacity-60 transition-all duration-200 cursor-pointer',
                'hover:opacity-100 hover:bg-muted',
                'focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none',
                'disabled:pointer-events-none disabled:cursor-not-allowed',
                '[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-4',
                'p-1.5',
                compact ? 'top-2 right-3' : 'top-4 right-4'
              )}
            >
              <XIcon />
              <span className="sr-only">Close</span>
            </DialogClosePrimitive>
          )}
        </DialogContentPrimitive>
      </DialogPortal>
    );
  }
);

DialogContent.displayName = 'DialogContent';

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn('flex flex-col gap-2 text-center sm:text-left', className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end mt-6', className)}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title> & {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <DialogTitlePrimitive
      data-slot="dialog-title"
      className={cn('text-lg leading-none font-semibold tracking-tight', className)}
      {...props}
    >
      {children}
    </DialogTitlePrimitive>
  );
}

function DialogDescription({
  className,
  children,
  title,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description> & {
  children?: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <DialogDescriptionPrimitive
      data-slot="dialog-description"
      className={cn('text-muted-foreground text-sm leading-relaxed', className)}
      title={title}
      {...props}
    >
      {children}
    </DialogDescriptionPrimitive>
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
