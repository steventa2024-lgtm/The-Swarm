import * as SwitchPrimitive from '@radix-ui/react-switch'
import { cn } from '@/lib/utils'

export function Switch({ className, ...props }: SwitchPrimitive.SwitchProps) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'relative h-5 w-9 shrink-0 cursor-pointer rounded-full border border-line bg-white/5 transition-all',
        'data-[state=checked]:border-azure-hi/60 data-[state=checked]:bg-azure/40 data-[state=checked]:shadow-[0_0_14px_-2px_rgba(59,130,255,0.8)]',
        'disabled:cursor-not-allowed disabled:opacity-40',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block h-3.5 w-3.5 translate-x-[3px] rounded-full bg-ink-2 transition-transform data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-white" />
    </SwitchPrimitive.Root>
  )
}
