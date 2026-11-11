import React from 'react';

/** The checkbox of one row, for "Export selected". */
export const RowSelect: React.FC<{ checked: boolean; onChange: () => void; label: string }> = ({ checked, onChange, label }) => (
  <input
    type="checkbox"
    checked={checked}
    onChange={onChange}
    aria-label={label}
    className="h-4 w-4 cursor-pointer rounded border-white/20 bg-transparent accent-emerald-500 light:border-gray-300"
  />
);
