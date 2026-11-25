import React from 'react';

// shadcn Input adapted to this app's CSS tokens rather than Tailwind utilities.
export const Input = React.forwardRef(function Input({ className = '', type = 'text', ...props }, ref) {
  return <input ref={ref} type={type} className={`ui-input ${className}`.trim()} {...props} />;
});
