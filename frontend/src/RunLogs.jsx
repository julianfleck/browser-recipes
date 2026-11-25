import React from 'react';
import {CopyButton} from './components/arc/copy-button/copy-button';
import './run-logs.css';

export default function RunLogs({text}) {
  if(!text)return null;
  return <details className="run-logs"><summary>Run logs</summary><div className="run-logs-toolbar"><span>Backend activity</span><CopyButton value={text} label="Copy logs"/></div><pre tabIndex={0} aria-label="Backend run log">{text}</pre></details>;
}
