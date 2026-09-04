import * as React from 'react'

import { cn } from '@/lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'placeholder:text-gray-400 focus-visible:border-blue-500 focus-visible:ring-blue-100 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 flex field-sizing-content min-h-16 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-base text-gray-950 shadow-sm transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-600 disabled:opacity-100 md:text-sm',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
