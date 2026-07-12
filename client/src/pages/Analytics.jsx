import React, { useState, useEffect } from 'react';
import { Fuel, Truck, Receipt, Percent, Info } from 'lucide-react';
import './Analytics.css';

// Custom hook for counting up numbers smoothly
function useCountUp(end, duration = 1500, delay = 0) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTime = null;
    let animationFrame = null;
    let hasStarted = false;

    const updateCount = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const progress = timestamp - startTime;

      if (progress < delay) {
        animationFrame = requestAnimationFrame(updateCount);
        return;
      }

      if (!hasStarted) {
        startTime = timestamp; // Reset start time after delay
        hasStarted = true;
      }

      const activeProgress = timestamp - startTime;
      const percentage = Math.min(activeProgress / duration, 1);
      
      // Easing function (easeOutExpo)
      const ease = percentage === 1 ? 1 : 1 - Math.pow(2, -10 * percentage);
      
      setCount(end * ease);

      if (percentage < 1) {
        animationFrame = requestAnimationFrame(updateCount);
      } else {
        setCount(end);
      }
    };

    animationFrame = requestAnimationFrame(updateCount);
    return () => cancelAnimationFrame(animationFrame);
  }, [end, duration, delay]);

  return count;
}

export default function Analytics() {
  // Use count up for KPI numbers
  const fuelEff = useCountUp(8.4, 1500, 100);
  const fleetUtil = useCountUp(81, 1500, 200);
  const opCost = useCountUp(34070, 1500, 300);
  const roi = useCountUp(14.2, 1500, 400);

  // Format currency
  const formatCurrency = (val) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Math.round(val));

  const chartData = [
    { month: 'Jan', value: 24000, height: '60%' },
    { month: 'Feb', value: 28500, height: '70%' },
    { month: 'Mar', value: 21000, height: '50%' },
    { month: 'Apr', value: 31000, height: '78%' },
    { month: 'May', value: 34500, height: '85%' },
    { month: 'Jun', value: 42000, height: '100%', highlight: true },
    { month: 'Jul', value: 38000, height: '90%' },
  ];

  const vehiclesData = [
    { id: 'TRK-11', cost: 18400, color: 'var(--an-coral)', width: '100%', delay: '0.5s' },
    { id: 'MINI-03', cost: 12500, color: 'var(--an-amber)', width: '68%', delay: '0.7s' },
    { id: 'VAN-05', cost: 8900, color: 'var(--an-blue)', width: '48%', delay: '0.9s' },
    { id: 'TRK-07', cost: 4200, color: 'var(--an-teal)', width: '22%', delay: '1.1s' },
  ];

  return (
    <div className="analytics-page">
      <h1 className="an-title">Reports & analytics</h1>
      <p className="an-subtitle">Fleet performance, costs, and return on investment at a glance.</p>

      {/* KPI Row */}
      <div className="an-kpi-grid">
        <div className="an-kpi-card blue">
          <div className="an-kpi-header">
            <Fuel size={14} /> Fuel efficiency
          </div>
          <div className="an-kpi-value">
            {fuelEff.toFixed(1)} <span className="an-kpi-unit">km/l</span>
          </div>
        </div>

        <div className="an-kpi-card green">
          <div className="an-kpi-header">
            <Truck size={14} /> Fleet utilization
          </div>
          <div className="an-kpi-value">
            {Math.round(fleetUtil)}<span className="an-kpi-unit">%</span>
          </div>
        </div>

        <div className="an-kpi-card amber">
          <div className="an-kpi-header">
            <Receipt size={14} /> Operational cost
          </div>
          <div className="an-kpi-value">
            {formatCurrency(opCost)}
          </div>
        </div>

        <div className="an-kpi-card purple">
          <div className="an-kpi-header">
            <Percent size={14} /> Vehicle ROI
          </div>
          <div className="an-kpi-value">
            {roi.toFixed(1)}<span className="an-kpi-unit">%</span>
          </div>
        </div>
      </div>

      <div className="an-roi-note">
        <Info size={14} className="an-pulse-icon" />
        ROI = (Revenue − (Maintenance + Fuel)) / Acquisition cost
      </div>

      {/* Panels Row */}
      <div className="an-panels-grid">
        
        {/* Left Panel: Revenue Chart */}
        <div className="an-panel">
          <div className="an-panel-title">Monthly revenue</div>
          <div className="an-chart-container">
            {chartData.map((data, index) => (
              <div key={data.month} className="an-bar-group">
                <div className="an-bar-wrapper">
                  <div 
                    className={`an-bar ${data.highlight ? 'highlight' : ''}`}
                    style={{ height: data.height, animationDelay: `${0.4 + (index * 0.1)}s` }}
                    data-value={formatCurrency(data.value)}
                  ></div>
                </div>
                <div className="an-bar-label">{data.month}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Panel: Costliest Vehicles */}
        <div className="an-panel">
          <div className="an-panel-title">Top costliest vehicles</div>
          <div className="an-cost-list">
            {vehiclesData.map((v) => (
              <div key={v.id} className="an-cost-item">
                <div className="an-cost-header">
                  <span className="an-chip">{v.id}</span>
                  <span className="an-cost-val">{formatCurrency(v.cost)}</span>
                </div>
                <div className="an-progress-bg">
                  <div 
                    className="an-progress-fill" 
                    style={{ 
                      backgroundColor: v.color, 
                      '--target-width': v.width,
                      animationDelay: v.delay
                    }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
