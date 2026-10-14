import React from 'react';
import { Info } from 'lucide-react';
import './common.css';

export default function PageToolbar({
  title,
  tooltip,
  badge,
  children,
  actions,
  className = '',
  style = {}
}) {
  return (
    <div className={`page-toolbar ${className}`} style={style}>
      <div className="page-toolbar-left">
        <h1 className="page-toolbar-title">
          {title}
          {badge && <span className="pill pill-blue">{badge}</span>}
        </h1>
        {tooltip && (
          <span className="page-toolbar-info" data-tooltip={tooltip} aria-label={tooltip}>
            <Info size={15} />
          </span>
        )}
      </div>

      {children && (
        <div className="page-toolbar-center">
          {children}
        </div>
      )}

      {actions && (
        <div className="page-toolbar-actions">
          {actions}
        </div>
      )}
    </div>
  );
}
