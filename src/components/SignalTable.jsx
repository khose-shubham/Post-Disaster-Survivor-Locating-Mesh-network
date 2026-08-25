import React from 'react';

export default function SignalTable({ targets }) {
  // Sort by freshest (lowest age) first
  const sortedTargets = [...targets].sort((a, b) => a.age_seconds - b.age_seconds);

  return (
    <div className="bg-command-panel border border-command-border p-4 flex flex-col h-full">
      <h2 className="text-lg font-bold text-white mb-4 uppercase tracking-wider border-b border-command-border pb-2">Detected Signals</h2>
      
      {sortedTargets.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 bg-black/20 border border-gray-800 border-dashed rounded-sm">
          <span className="text-gray-400 font-mono text-sm">NO SIGNALS DETECTED</span>
          <span className="text-gray-600 text-xs mt-1">Normal idle state</span>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm font-mono">
            <thead className="text-gray-500 bg-black/40 uppercase text-xs">
              <tr>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Pos (x, y)</th>
                <th className="px-3 py-2">Confidence radius</th>
                <th className="px-3 py-2">Nodes Seen</th>
                <th className="px-3 py-2 text-right">Age</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {sortedTargets.map((target) => {
                const isUrgent = target.age_seconds < 3;
                return (
                  <tr key={target.id} className="hover:bg-gray-900/50">
                    <td className="px-3 py-3 font-bold text-gray-300">{target.id}</td>
                    <td className="px-3 py-3 text-gray-400">[{target.x.toFixed(2)}, {target.y.toFixed(2)}]</td>
                    <td className="px-3 py-3 text-gray-400">{target.confidence_radius.toFixed(2)}m</td>
                    <td className="px-3 py-3 text-gray-400">{target.nodes_seen}</td>
                    <td className={`px-3 py-3 text-right font-bold ${isUrgent ? 'text-red-400' : 'text-amber-500'}`}>
                      {target.age_seconds.toFixed(1)}s
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
