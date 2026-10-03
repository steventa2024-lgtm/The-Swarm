import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-all duration-200 disabled:pointer-events-none disabled:opacity-40 active:scale-[0.98] [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'grad-azure text-white shadow-[0_0_0_1px_rgba(150,200,255,0.35),0_8px_28px_-8px_rgba(59,130,255,0.9)] hover:brightness-110 hover:shadow-[0_0_0_1px_rgba(170,215,255,0.5),0_10px_34px_-6px_rgba(59,130,255,1)]',
        glass:
          'glass glass-hover text-ink hover:text-white',
        ghost: 'text-ink-2 hover:bg-white/5 hover:text-ink',
        danger:
          'border border-bad/30 bg-bad/10 text-bad hover:bg-bad/20 hover:border-bad/50',
        outline: 'border border-line text-ink-2 hover:border-line-hi hover:text-ink hover:bg-azure/10',
      },
      size: {
        sm: 'h-7 px-2.5 text-xs',
        md: 'h-9 px-3.5 text-[13px]',
        lg: 'h-11 px-5 text-sm',
        icon: 'h-8 w-8',
      },
    },
    defaultVariants: { variant: 'glass', size: 'md' },
  },
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  },
)
Button.displayName = 'Button'
