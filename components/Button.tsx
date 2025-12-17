import React from 'react';
import { LucideIcon } from 'lucide-react';

interface ButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'success' | 'ghost' | 'outline' | 'ai';
  className?: string;
  icon?: LucideIcon;
  disabled?: boolean;
}

const Button: React.FC<ButtonProps> = ({ 
  onClick, 
  children, 
  variant = 'primary', 
  className = '', 
  icon: Icon, 
  disabled = false 
}) => {
  const baseStyle = "flex items-center justify-center px-4 py-3 rounded-lg font-semibold transition-all duration-200 active:scale-95 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-slate-900 text-white hover:bg-slate-800",
    secondary: "bg-white text-slate-900 border border-slate-200 hover:bg-slate-50",
    success: "bg-emerald-600 text-white hover:bg-emerald-700",
    ghost: "bg-transparent text-slate-600 hover:bg-slate-100 shadow-none",
    outline: "border-2 border-slate-900 text-slate-900 hover:bg-slate-50",
    ai: "bg-indigo-600 text-white hover:bg-indigo-700 border border-indigo-500 shadow-indigo-100"
  };

  return (
    <button 
      onClick={onClick} 
      disabled={disabled}
      className={`${baseStyle} ${variants[variant]} ${className}`}
    >
      {Icon && <Icon size={18} className="mr-2" />}
      {children}
    </button>
  );
};

export default Button;