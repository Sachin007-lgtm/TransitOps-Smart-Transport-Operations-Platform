import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical, Edit2, KeyRound, Trash2 } from 'lucide-react';

export default function DriverActionMenu({ driver, onEdit, onResetPassword, onDelete }) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  const toggleMenu = (e) => {
    e.stopPropagation();
    if (isOpen) {
      setIsOpen(false);
      return;
    }

    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const menuHeight = 135;
      const menuWidth = 180;
      
      // Auto-flip upwards if not enough space below
      const spaceBelow = window.innerHeight - rect.bottom;
      const top = spaceBelow < menuHeight + 10
        ? Math.max(10, rect.top - menuHeight - 4)
        : rect.bottom + 4;

      const left = Math.max(10, rect.right - menuWidth);

      setMenuPos({ top, left });
      setIsOpen(true);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e) => {
      // Don't close if clicking inside the menu or clicking the trigger button itself
      if (
        (menuRef.current && menuRef.current.contains(e.target)) ||
        (buttonRef.current && buttonRef.current.contains(e.target))
      ) {
        return;
      }
      setIsOpen(false);
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    const handleScrollOrResize = () => {
      setIsOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen]);

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button 
        ref={buttonRef}
        type="button"
        className={`three-dot-btn ${isOpen ? 'active' : ''}`} 
        title="More actions"
        onClick={toggleMenu}
      >
        <MoreVertical size={16} />
      </button>

      {isOpen && createPortal(
        <div 
          ref={menuRef}
          className="action-dropdown-menu fade-in" 
          style={{ 
            position: 'fixed', 
            top: `${menuPos.top}px`, 
            left: `${menuPos.left}px`, 
            zIndex: 9999 
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button 
            type="button" 
            className="action-dropdown-item" 
            onClick={() => {
              setIsOpen(false);
              onEdit(driver);
            }}
          >
            <Edit2 size={14} className="text-muted" />
            <span>Edit Profile</span>
          </button>

          <button 
            type="button" 
            className="action-dropdown-item" 
            onClick={() => {
              setIsOpen(false);
              onResetPassword(driver);
            }}
          >
            <KeyRound size={14} className="text-muted" />
            <span>Reset App Password</span>
          </button>

          <button 
            type="button" 
            className="action-dropdown-item danger"
            onClick={() => {
              setIsOpen(false);
              onDelete(driver);
            }}
          >
            <Trash2 size={14} />
            <span>Delete Driver</span>
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}
