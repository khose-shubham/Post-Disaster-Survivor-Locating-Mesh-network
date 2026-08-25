import React from 'react';

export default function Header() {
  return (
    <header className="border-b border-command-border pb-4 mb-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-widest text-white m-0">SURVIVOR-LOCATING MESH</h1>
          <p className="text-sm text-gray-400 mt-1 uppercase tracking-wider">Tactical Command Dashboard</p>
        </div>
        
        <div className="mt-4 md:mt-0 bg-amber-900/30 border border-amber-600/50 p-3 rounded-sm max-w-md">
          <p className="text-amber-500 text-xs font-bold flex items-start">
            <span className="mr-2 text-base leading-none">⚠️</span>
            <span>
              CRITICAL NOTICE: Map circles represent probability zones based on signal strength. 
              They DO NOT indicate exact survivor coordinates. Deploy teams cautiously within these zones.
            </span>
          </p>
        </div>
      </div>
    </header>
  );
}
