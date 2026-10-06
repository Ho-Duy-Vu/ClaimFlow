import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-full text-sm font-semibold tracking-tight ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]',
  {
    variants: {
      variant: {
        default:
          'bg-[#2e96ff] text-white font-bold hover:bg-[#2585e5] shadow-[0_7px_0_0_rgba(154,207,246,0.5)] active:translate-y-1 active:shadow-[0_3px_0_0_rgba(154,207,246,0.5)]',
        relief:
          'bg-[#2e96ff] text-white font-bold hover:bg-[#2585e5] shadow-[0_7px_0_0_rgba(154,207,246,0.5)] active:translate-y-1 active:shadow-[0_3px_0_0_rgba(154,207,246,0.5)]',
        reliefGhost:
          'bg-transparent hover:bg-[#bde1f9]/20 text-[#0254a5] border-2 border-[#0254a5] font-semibold',
        reliefHarbor:
          'bg-[#13426f] hover:bg-[#0f3458] text-white font-bold shadow-[0_5px_0_0_rgba(0,0,0,0.12)] active:translate-y-0.5',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-[#d0d5dd] bg-white hover:bg-[#f9f7f0] text-[#333333]',
        secondary: 'bg-[#bde1f9] text-[#13426f] hover:bg-[#a9d7f7] font-semibold',
        ghost: 'hover:bg-[#bde1f9]/25 text-[#333333]',
        link: 'text-[#2e96ff] underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-6 py-2',
        sm: 'h-8 px-4 text-xs',
        lg: 'h-12 px-8 text-base',
        icon: 'h-10 w-10 p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
