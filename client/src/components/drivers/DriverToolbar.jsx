import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Plus } from 'lucide-react';
import { DRIVER_STATUS_FILTERS } from './driverConstants';

export default function DriverToolbar({ 
  globalSearch, 
  setGlobalSearch, 
  statusFilter, 
  setStatusFilter, 
  onOpenAddModal 
}) {
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const statusRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (statusRef.current && !statusRef.current.contains(e.target)) {
        setIsStatusOpen(false);
      }
    };
    document.addEventListener('pointerdown', handleOutsideClick);
    return () => document.removeEventListener('pointerdown', handleOutsideClick);
  }, []);

  return (
    <div className="flex items-center gap-4 mb-6" style={{ position: 'relative', zIndex: 10, flexWrap: 'wrap' }}>
      {/* Search Bar */}
      <div style={{ position: 'relative', width: '240px' }}>
        <Search 
          size={16} 
          className="text-muted" 
          style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }} 
        />
        <input 
          type="text" 
          placeholder="Search driver name, license..." 
          className="input" 
          style={{ width: '100%', paddingLeft: '2.5rem' }}
          value={globalSearch || ''}
          onChange={(e) => setGlobalSearch && setGlobalSearch(e.target.value)}
        />
      </div>

      {/* Standard Status Filter Dropdown matching Vehicles.jsx */}
      <div style={{ position: 'relative', width: '160px' }} ref={statusRef}>
        <div 
          className="input flex items-center justify-between" 
          style={{ cursor: 'pointer' }}
          onClick={() => setIsStatusOpen(!isStatusOpen)}
        >
          <span>{statusFilter}</span>
          <ChevronDown 
            size={16} 
            className="text-muted" 
            style={{ transform: isStatusOpen ? 'rotate(180deg)' : 'none', transition: '0.2s' }} 
          />
        </div>
        {isStatusOpen && (
          <div className="custom-dropdown-menu">
            {DRIVER_STATUS_FILTERS.map(s => (
              <div 
                key={s} 
                className="custom-dropdown-item" 
                onClick={() => { 
                  setStatusFilter(s); 
                  setIsStatusOpen(false); 
                }}
              >
                {s}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1"></div>

      {/* Add Driver CTA Button */}
      <button 
        type="button"
        className="btn btn-plum-glow flex items-center gap-2" 
        onClick={onOpenAddModal}
      >
        <Plus size={16} /> Add driver
      </button>
    </div>
  );
}
