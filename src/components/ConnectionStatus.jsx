import React from 'react';

export default function ConnectionStatus({ isConnected, error }) {
  if (isConnected) {
    return (
      <div className="flex items-center space-x-2 text-command-accent text-sm font-bold bg-command-panel border border-command-border px-4 py-2 rounded-sm inline-flex">
        <div className="w-2 h-2 rounded-full bg-command-accent animate-pulse"></div>
        <span>SYSTEM ONLINE — RECEIVING TELEMETRY</span>
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-2 text-red-500 text-sm font-bold bg-red-950/30 border border-red-800 px-4 py-2 rounded-sm inline-flex">
      <div className="w-2 h-2 rounded-full bg-red-500"></div>
      <span>CONNECTION LOST — SYSTEM OFFLINE</span>
      {error && <span className="text-xs text-red-400 ml-2">({error})</span>}
    </div>
  );
}
