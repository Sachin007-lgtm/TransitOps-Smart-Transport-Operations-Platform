import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [dialogState, setDialogState] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [inputError, setInputError] = useState('');
  const resolveRef = useRef(null);
  const inputRef = useRef(null);

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setInputValue(options.inputPrompt?.defaultValue || '');
      setInputError('');
      setDialogState({
        title: options.title || 'Confirm Action',
        message: options.message || 'Are you sure you want to proceed?',
        confirmText: options.confirmText || 'Confirm',
        cancelText: options.cancelText || 'Cancel',
        variant: options.variant || 'warning', // 'danger' | 'warning' | 'info'
        inputPrompt: options.inputPrompt || null, // { label, placeholder, required, minLength, defaultValue }
      });
    });
  }, []);

  const handleClose = useCallback((confirmed = false) => {
    if (!dialogState) return;
    const isPrompt = Boolean(dialogState.inputPrompt);

    if (confirmed) {
      if (isPrompt) {
        const trimmed = inputValue.trim();
        const minLen = dialogState.inputPrompt.minLength || (dialogState.inputPrompt.required ? 1 : 0);
        if (minLen > 0 && trimmed.length < minLen) {
          setInputError(`Please provide at least ${minLen} characters.`);
          return;
        }
        resolveRef.current?.(trimmed);
      } else {
        resolveRef.current?.(true);
      }
    } else {
      resolveRef.current?.(isPrompt ? null : false);
    }

    setDialogState(null);
    setInputValue('');
    setInputError('');
  }, [dialogState, inputValue]);

  // Handle ESC key
  useEffect(() => {
    if (!dialogState) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleClose(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dialogState, handleClose]);

  // Auto-focus input if prompt is active
  useEffect(() => {
    if (dialogState?.inputPrompt && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [dialogState]);

  // Variant visual configuration
  const getVariantStyles = (variant) => {
    switch (variant) {
      case 'danger':
        return {
          icon: <AlertTriangle size={24} style={{ color: '#ef4444' }} />,
          iconBg: 'rgba(239, 68, 68, 0.12)',
          iconBorder: 'rgba(239, 68, 68, 0.25)',
          confirmBtnBg: '#dc2626',
          confirmBtnHover: '#b91c1c',
          confirmBtnText: '#ffffff',
          accentColor: '#ef4444'
        };
      case 'info':
        return {
          icon: <Info size={24} style={{ color: '#3b82f6' }} />,
          iconBg: 'rgba(59, 130, 246, 0.12)',
          iconBorder: 'rgba(59, 130, 246, 0.25)',
          confirmBtnBg: '#2563eb',
          confirmBtnHover: '#1d4ed8',
          confirmBtnText: '#ffffff',
          accentColor: '#3b82f6'
        };
      case 'warning':
      default:
        return {
          icon: <AlertCircle size={24} style={{ color: 'var(--amber, #e5a93c)' }} />,
          iconBg: 'rgba(229, 169, 60, 0.12)',
          iconBorder: 'rgba(229, 169, 60, 0.25)',
          confirmBtnBg: 'var(--amber, #e5a93c)',
          confirmBtnHover: '#d4972e',
          confirmBtnText: '#1a161f',
          accentColor: 'var(--amber, #e5a93c)'
        };
    }
  };

  const currentStyles = dialogState ? getVariantStyles(dialogState.variant) : null;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}

      {dialogState && createPortal(
        <div 
          className="modal-overlay" 
          onMouseDown={() => handleClose(false)}
          style={{ zIndex: 99999 }}
        >
          <div 
            className="modal-content fade-in"
            onMouseDown={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-modal-title"
            aria-describedby="confirm-modal-description"
            style={{ 
              maxWidth: '460px', 
              padding: '1.75rem',
              borderRadius: '16px',
              border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
              background: 'var(--bg-card, #ffffff)',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.2)'
            }}
          >
            {/* Header with Icon and Close Button */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                <div style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: currentStyles.iconBg,
                  border: `1px solid ${currentStyles.iconBorder}`,
                  flexShrink: 0
                }}>
                  {currentStyles.icon}
                </div>
                <div>
                  <h3 
                    id="confirm-modal-title"
                    style={{ 
                      fontSize: '1.15rem', 
                      fontWeight: 700, 
                      color: 'var(--text-primary, #2b2530)', 
                      margin: 0,
                      lineHeight: 1.3
                    }}
                  >
                    {dialogState.title}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleClose(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted, #8a8794)',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </div>

            {/* Message Body */}
            <p 
              id="confirm-modal-description"
              style={{ 
                color: 'var(--text-muted, #64748b)', 
                fontSize: '0.9rem', 
                lineHeight: 1.55, 
                marginBottom: dialogState.inputPrompt ? '1rem' : '1.75rem' 
              }}
            >
              {dialogState.message}
            </p>

            {/* Optional Input Prompt */}
            {dialogState.inputPrompt && (
              <div style={{ marginBottom: '1.5rem' }}>
                {dialogState.inputPrompt.label && (
                  <label style={{ 
                    display: 'block', 
                    fontSize: '0.8rem', 
                    fontWeight: 600, 
                    color: 'var(--text-primary, #2b2530)', 
                    marginBottom: '0.4rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em'
                  }}>
                    {dialogState.inputPrompt.label}
                  </label>
                )}
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => {
                    setInputValue(e.target.value);
                    if (inputError) setInputError('');
                  }}
                  placeholder={dialogState.inputPrompt.placeholder || 'Type here...'}
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    fontSize: '0.875rem',
                    borderRadius: '8px',
                    border: `1px solid ${inputError ? '#ef4444' : 'var(--border-color, #e2e8f0)'}`,
                    backgroundColor: 'var(--bg-app, #f8fafc)',
                    color: 'var(--text-primary, #2b2530)',
                    fontFamily: 'inherit',
                    resize: 'vertical',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      handleClose(true);
                    }
                  }}
                />
                {inputError && (
                  <span style={{ display: 'block', color: '#ef4444', fontSize: '0.78rem', marginTop: '0.35rem' }}>
                    {inputError}
                  </span>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => handleClose(false)}
                className="btn btn-outline"
                style={{
                  padding: '0.6rem 1.15rem',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  borderColor: 'var(--border-color, #cbd5e1)',
                  color: 'var(--text-primary, #475569)'
                }}
              >
                {dialogState.cancelText}
              </button>
              <button
                type="button"
                onClick={() => handleClose(true)}
                style={{
                  padding: '0.6rem 1.25rem',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: currentStyles.confirmBtnBg,
                  color: currentStyles.confirmBtnText,
                  transition: 'background-color 0.15s ease'
                }}
              >
                {dialogState.confirmText}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmProvider');
  }
  return context;
}
