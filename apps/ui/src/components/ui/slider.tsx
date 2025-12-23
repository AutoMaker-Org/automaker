import * as React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn } from '@/lib/utils';

// Type-safe wrappers for Radix UI primitives (React 19 compatibility)
const SliderRootPrimitive = SliderPrimitive.Root as React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & {
    children?: React.ReactNode;
    className?: string;
  } & React.RefAttributes<HTMLSpanElement>
>;

const SliderTrackPrimitive = SliderPrimitive.Track as React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Track> & {
    children?: React.ReactNode;
    className?: string;
  } & React.RefAttributes<HTMLSpanElement>
>;

const SliderRangePrimitive = SliderPrimitive.Range as React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Range> & {
    className?: string;
  } & React.RefAttributes<HTMLSpanElement>
>;

const SliderThumbPrimitive = SliderPrimitive.Thumb as React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Thumb> & {
    className?: string;
  } & React.RefAttributes<HTMLSpanElement>
>;

interface SliderProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'defaultValue' | 'dir'> {
  value?: number[];
  defaultValue?: number[];
  onValueChange?: (value: number[]) => void;
  onValueCommit?: (value: number[]) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  orientation?: 'horizontal' | 'vertical';
  dir?: 'ltr' | 'rtl';
  inverted?: boolean;
  minStepsBetweenThumbs?: number;
}

const Slider = React.forwardRef<HTMLSpanElement, SliderProps>(({ className, ...props }, ref) => (
  <SliderRootPrimitive
    ref={ref}
    className={cn('relative flex w-full touch-none select-none items-center', className)}
    {...props}
  >
    <SliderTrackPrimitive className="slider-track relative h-1.5 w-full grow overflow-hidden rounded-full bg-white/10 cursor-pointer">
      <SliderRangePrimitive className="slider-range absolute h-full bg-cyan-400" />
    </SliderTrackPrimitive>
    <SliderThumbPrimitive className="slider-thumb block h-4 w-4 rounded-full border border-cyan-400/50 bg-background shadow-none transition-colors cursor-grab active:cursor-grabbing focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400 disabled:pointer-events-none disabled:opacity-50 hover:bg-cyan-950/30 hover:border-cyan-400" />
  </SliderRootPrimitive>
));
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
