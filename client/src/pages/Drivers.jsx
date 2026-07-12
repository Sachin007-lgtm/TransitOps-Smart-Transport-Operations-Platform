import React from 'react';
import { Plus } from 'lucide-react';

export default function Drivers() {
  return (
    <div className="fade-in">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl heading">Drivers & Safety Profiles</h1>
        <button className="btn btn-primary">
          <Plus size={16} /> Add Driver
        </button>
      </div>

      <div className="card mb-6">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Driver</th>
                <th>License No</th>
                <th>Category</th>
                <th>Expiry</th>
                <th>Contact</th>
                <th>Trip Compl.</th>
                <th>Safety</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-indicator border-green">
                <td className="font-medium">Alex</td>
                <td className="mono">DL-88213</td>
                <td>LMV</td>
                <td className="mono">12/2028</td>
                <td className="mono">98765xxxxx</td>
                <td className="mono">96%</td>
                <td><span className="pill pill-green">Excellent</span></td>
                <td><span className="pill pill-green">Available</span></td>
              </tr>
              <tr className="border-indicator border-red">
                <td className="font-medium">John</td>
                <td className="mono">DL-44120</td>
                <td>HMV</td>
                <td className="mono flex items-center gap-2">
                  03/2025
                  <span className="pill pill-red" style={{ fontSize: '0.65rem' }}>Expired</span>
                </td>
                <td className="mono">98220xxxxx</td>
                <td className="mono">81%</td>
                <td><span className="pill pill-orange">Needs Review</span></td>
                <td><span className="pill pill-red">Suspended</span></td>
              </tr>
              <tr className="border-indicator border-blue">
                <td className="font-medium">Priya</td>
                <td className="mono">DL-77031</td>
                <td>LMV</td>
                <td className="mono">08/2025</td>
                <td className="mono">99110xxxxx</td>
                <td className="mono">99%</td>
                <td><span className="pill pill-green">Excellent</span></td>
                <td><span className="pill pill-blue">On Trip</span></td>
              </tr>
              <tr className="border-indicator border-gray">
                <td className="font-medium">Suresh</td>
                <td className="mono">DL-90045</td>
                <td>HMV</td>
                <td className="mono flex items-center gap-2">
                  09/2026
                  <span className="pill pill-orange" style={{ fontSize: '0.65rem' }}>Exp in 30d</span>
                </td>
                <td className="mono">97440xxxxx</td>
                <td className="mono">88%</td>
                <td><span className="pill pill-green">Good</span></td>
                <td><span className="pill pill-gray">Off Duty</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3 className="heading text-sm mb-3 uppercase tracking-wide text-muted">Status Legend & Rules</h3>
        <div className="flex gap-4 mb-3">
          <span className="pill pill-green">Available</span>
          <span className="pill pill-blue">On Trip</span>
          <span className="pill pill-gray">Off Duty</span>
          <span className="pill pill-red">Suspended</span>
        </div>
        <div className="text-xs text-status-orange font-medium">
          Rule: Expired license or Suspended status → blocked from trip assignment
        </div>
      </div>
    </div>
  );
}
