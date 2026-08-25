import React from 'react';

export default function NodeStatus({ nodes, isConnected }) {
  const nodeEntries = Object.entries(nodes || {});

  return (
    <div className="bg-command-panel border border-command-border p-4 flex flex-col h-full">
      <h2 className="text-lg font-bold text-white mb-4 uppercase tracking-wider border-b border-command-border pb-2">Mesh Nodes</h2>
      
      {nodeEntries.length === 0 ? (
        <div className="text-gray-500 text-sm italic">Waiting for node data...</div>
      ) : (
        <ul className="space-y-3 flex-1 overflow-y-auto">
          {nodeEntries.map(([id, [x, y]]) => (
            <li key={id} className="flex justify-between items-center bg-black/40 p-2 rounded-sm border border-gray-800">
              <div className="flex items-center space-x-3">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="font-bold text-gray-300">Node {id}</span>
              </div>
              <div className="text-xs text-gray-500 font-mono bg-gray-900 px-2 py-1 rounded">
                [{x.toFixed(1)}, {y.toFixed(1)}]
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
