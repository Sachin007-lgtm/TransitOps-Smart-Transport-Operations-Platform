import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import './common.css';

export default function SideDrawer({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = '480px'
}) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      <div
        className={`side-drawer-overlay ${isOpen ? 'is-open' : ''}`}
        onClick={onClose}
        aria-hidden={!isOpen}
      />
      <div
        className={`side-drawer ${isOpen ? 'is-open' : ''}`}
        style={{ width }}
        role="dialog"
        aria-modal="true"
        aria-hidden={!isOpen}
      >
        <div className="side-drawer-header">
          <div>
            <h3 className="side-drawer-title">{title}</h3>
            {subtitle && <p className="side-drawer-subtitle">{subtitle}</p>}
          </div>
          <button
            type="button"
            className="side-drawer-close"
            onClick={onClose}
            aria-label="Close drawer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="side-drawer-body">
          {children}
        </div>

        {footer && (
          <div className="side-drawer-footer">
            {footer}
          </div>
        )}
      </div>
    </>,
    document.body
  );
}
