import React from 'react';

interface ProgressBarProps {
  current: number;
  max: number;
  label: string;
  colorClass?: string;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ current, max, label, colorClass = "bg-slate-900" }) => (
  <div className="mb-3">
    <div className="flex justify-between text-xs font-semibold text-slate-500 mb-1">
      <span>{label}</span>
      <span>{current}/{max}</span>
    </div>
    <div className="w-full bg-slate-100 rounded-full h-2.5">
      <div 
        className={`h-2.5 rounded-full transition-all duration-500 ${colorClass}`} 
        style={{ width: `${Math.min((current / max) * 100, 100)}%` }}
      ></div>
    </div>
  </div>
);

export default ProgressBar;