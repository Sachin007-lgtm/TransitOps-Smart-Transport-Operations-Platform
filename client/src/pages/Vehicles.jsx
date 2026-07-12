import React, { useState } from 'react';
import { Plus, Download, Lock } from 'lucide-react';

export default function Vehicles() {
  const [exported, setExported] = useState(false);

  const handleExport = () => {
    setExported(true);
    setTimeout(() => setExported(false), 2000);
  };

  return (
    <div className="fade-in">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl heading">Fleet Registry</h1>
        <div className="flex gap-4">
          <button className="btn btn-outline" onClick={handleExport} style={{ width: '120px' }}>
            {exported ? <span className="text-status-green">✓ Exported</span> : <><Download size={16} /> Export</>}
          </button>
          <button className="btn btn-primary">
            <Plus size={16} /> Add Vehicle
          </button>
        </div>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Reg. No. (Unique)</th>
                <th>Name/Model</th>
                <th>Type</th>
                <th>Capacity</th>
                <th>Odometer</th>
                <th>Acq. Cost</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-indicator border-green">
                <td className="mono font-medium">GJ01AB452</td>
                <td>VAN-05</td>
                <td>Van</td>
                <td>500 kg</td>
                <td className="mono">74,000</td>
                <td className="mono">6,20,000</td>
                <td><span className="pill pill-green">Available</span></td>
              </tr>
              <tr className="border-indicator border-blue pulse-blue">
                <td className="mono font-medium">GJ01AB998</td>
                <td>TRUCK-11</td>
                <td>Truck</td>
                <td>5 Ton</td>
                <td className="mono">182,000</td>
                <td className="mono">24,50,000</td>
                <td><span className="pill pill-blue">On Trip</span></td>
              </tr>
              <tr className="border-indicator border-orange">
                <td className="mono font-medium flex items-center gap-2">
                  GJ01AB1120
                  <Lock size={14} className="text-status-orange" title="Locked out of dispatch" />
                </td>
                <td>MINI-03</td>
                <td>Mini</td>
                <td>1 Ton</td>
                <td className="mono">66,000</td>
                <td className="mono">4,10,000</td>
                <td><span className="pill pill-orange">In Shop</span></td>
              </tr>
              <tr className="border-indicator border-red opacity-50">
                <td className="mono font-medium">GJ01AB008</td>
                <td>VAN-09</td>
                <td>Van</td>
                <td>750 kg</td>
                <td className="mono">241,900</td>
                <td className="mono">5,90,000</td>
                <td><span className="pill pill-red">Retired</span></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="text-xs text-status-orange mt-4 font-medium">
          Rule: Registration No. must be unique • Retired/In Shop vehicles are hidden from Trip Dispatcher
        </div>
      </div>
    </div>
  );
}
