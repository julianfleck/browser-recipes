import React from 'react';
import { Check } from 'lucide-react';
import './workflow-progress.css';
export default function WorkflowProgress({ phase = 0, complete = false }) {
  return <ol className="workflow-progress" aria-label="Workflow progress">{['Record','Review','Test & save'].map((label,index)=><li key={label} data-state={complete||index<phase?'complete':index===phase?'current':'later'} aria-current={!complete&&index===phase?'step':undefined}><span>{complete||index<phase?<Check size={11}/>:index+1}</span><strong>{label}</strong></li>)}</ol>;
}
