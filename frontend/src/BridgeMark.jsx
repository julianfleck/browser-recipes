import React from 'react';

export default function BridgeMark({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M4 19V9a4 4 0 0 1 8 0v10M12 19V9a4 4 0 0 1 8 0v10M2 19h20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}
