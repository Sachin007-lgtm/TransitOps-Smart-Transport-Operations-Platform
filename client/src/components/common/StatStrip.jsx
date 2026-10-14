import React from 'react';
import './common.css';

export default function StatStrip({ items = [], className = '', style = {} }) {
  if (!items || items.length === 0) return null;

  return (
    <div className={`stat-strip ${className}`} style={style} role="region" aria-label="Page metrics summary">
      {items.map((item, idx) => {
        const isZero = item.value === 0 || item.value === '0' || item.value === '₹0' || item.value === '₹0.00';
        const dimmed = item.isDimmed ?? isZero;

        return (
          <React.Fragment key={idx}>
            {idx > 0 && <span className="stat-sep" aria-hidden="true">·</span>}
            <div className={`stat-item ${dimmed ? 'is-dimmed' : ''}`} style={item.color ? { color: item.color } : undefined}>
              {item.icon && <span className="stat-icon">{item.icon}</span>}
              <span className="stat-label">{item.label}</span>
              <span className="stat-value">{item.value}</span>
              {item.badge && <span className="stat-badge">{item.badge}</span>}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
