import React from 'react';
import { X } from 'lucide-react';

// ─── THE DESIGN SYSTEM (POLISH-PLAN D1) ──────────────────────────────────────
// One button anatomy. One modal shell. One semantic color map. Nothing below 12px.
// Icon law: lucide for UI verbs, PNG art for currencies, emoji only in game-flavor copy.

/** Semantic colors — assign by MEANING, never by whim. */
export const C = {
  action: '#f97316',   // orange — the club's color IS the action color
  coins: '#eab308',
  crowns: '#a855f7',
  fans: '#f43f5e',
  defense: '#0ea5e9',  // shields, defense info
  danger: '#ef4444',   // destructive + rival
  success: '#22c55e',  // wins, sealed lanes, confirmations
  live: '#d946ef',     // real-player PvP surfaces
  surface: '#111827',  // the club charcoal — panels
  surfaceDeep: '#0b0f1a',
} as const;

/** Type scale — four sizes, floor 12px (D5 accessibility). */
export const T = {
  cap: 'text-[12px] font-bold uppercase tracking-wide',   // captions, labels, chips
  body: 'text-sm',                                        // 14 — default copy
  title: 'text-lg font-display font-bold uppercase tracking-tight', // 18 — section titles
  display: 'text-[28px] font-display font-black uppercase',         // big moments
} as const;

const BTN_VARIANTS = {
  primary: 'bg-orange-500 hover:bg-orange-400 text-white',
  secondary: 'bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100',
  ghost: 'bg-transparent hover:bg-slate-800/60 text-slate-300 hover:text-white',
  danger: 'bg-transparent border border-red-900 text-red-400 hover:bg-red-950/50',
} as const;

const BTN_SIZES = {
  sm: 'px-3 py-1.5 text-[12px] rounded-lg',
  md: 'px-5 py-2.5 text-sm rounded-xl',
  lg: 'w-full py-3 text-base rounded-xl',
} as const;

export const Btn: React.FC<{
  variant?: keyof typeof BTN_VARIANTS;
  size?: keyof typeof BTN_SIZES;
  disabled?: boolean;
  title?: string;
  className?: string;
  onClick?: () => void;
  children: React.ReactNode;
}> = ({ variant = 'primary', size = 'md', disabled, title, className = '', onClick, children }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`font-bold transition-all active:scale-95 flex items-center justify-center gap-2
      ${BTN_VARIANTS[variant]} ${BTN_SIZES[size]}
      ${disabled ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''} ${className}`}
  >
    {children}
  </button>
);

/** The ONE modal shell: identical header anatomy, close button, scroll body, optional footer.
 *  Every sheet in the game goes through here so nothing is "slightly different" again. */
export const Sheet: React.FC<{
  title: React.ReactNode;
  icon?: React.ReactNode;
  subtitle?: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
  actions?: React.ReactNode; // header controls (e.g. Scout Search) — rendered beside close
  maxWidth?: string;
  scroll?: boolean; // false = workspace mode: children manage their own panes (two-pane layouts)
  children: React.ReactNode;
}> = ({ title, icon, subtitle, onClose, footer, actions, maxWidth = 'max-w-lg', scroll = true, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-0 sm:p-4" onClick={onClose}>
    {/* Phones get FULL-SCREEN sheets (every pixel counts); desktop keeps the floating card. */}
    <div
      className={`bg-[#0b0f1a] w-full ${maxWidth} h-full sm:h-auto max-h-full sm:max-h-[88vh] rounded-none sm:rounded-2xl border-0 sm:border border-slate-800 shadow-2xl flex flex-col overflow-hidden`}
      onClick={e => e.stopPropagation()}
    >
      {/* Header stacks: title row → full-width subtitle → actions row. Never squeezes
          the subtitle into a one-word column or truncates the title on phones. */}
      <div className="p-4 sm:p-5 border-b border-slate-800 bg-[#111827] shrink-0">
        <div className="flex justify-between items-center gap-3">
          <h2 className="text-lg sm:text-xl font-display font-bold text-white uppercase tracking-tight flex items-center gap-2.5 min-w-0 flex-wrap">
            {icon}{title}
          </h2>
          <button onClick={onClose} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-full text-white transition-colors shrink-0"><X size={18} /></button>
        </div>
        {subtitle && <p className="text-slate-400 text-[12px] mt-1">{subtitle}</p>}
        {actions && <div className="mt-2.5 flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className={scroll ? 'flex-1 overflow-y-auto min-h-0' : 'flex-1 min-h-0 overflow-hidden flex flex-col'}>{children}</div>
      {footer && <div className="p-4 border-t border-slate-800 bg-[#111827] shrink-0">{footer}</div>}
    </div>
  </div>
);
