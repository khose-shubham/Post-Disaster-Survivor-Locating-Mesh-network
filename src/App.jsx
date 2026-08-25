import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import ConnectionStatus from './components/ConnectionStatus';
import LiveMap from './components/LiveMap';
import SignalTable from './components/SignalTable';
import NodeStatus from './components/NodeStatus';

const API_BASE = 'http://localhost:5000/api';

function App() {
  const [nodes, setNodes] = useState({});
  const [targets, setTargets] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // Fetch nodes once on mount
  useEffect(() => {
    fetch(`${API_BASE}/nodes`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch nodes');
        return res.json();
      })
      .then(data => {
        setNodes(data);
        setIsConnected(true);
        setErrorMsg(null);
      })
      .catch(err => {
        console.error('Error fetching nodes:', err);
        setIsConnected(false);
        setErrorMsg('Node API unreachable');
      });
  }, []);

  // Poll targets every 1 second
  useEffect(() => {
    const fetchTargets = () => {
      fetch(`${API_BASE}/targets`)
        .then(res => {
          if (!res.ok) throw new Error('Failed to fetch targets');
          return res.json();
        })
        .then(data => {
          setTargets(data);
          setIsConnected(true);
          setErrorMsg(null);
        })
        .catch(err => {
          console.error('Error fetching targets:', err);
          setIsConnected(false);
          setErrorMsg('Telemetry API unreachable');
        });
    };

    const intervalId = setInterval(fetchTargets, 1000);
    // Initial fetch
    fetchTargets();

    return () => clearInterval(intervalId);
  }, []);

  return (
    <div className="min-h-screen bg-command-bg text-command-text p-6 flex flex-col font-mono h-screen">
      <Header />
      
      <div className="mb-4">
        <ConnectionStatus isConnected={isConnected} error={errorMsg} />
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-6 min-h-0">
        {/* Left Column: Map */}
        <div className="lg:col-span-3 flex flex-col h-full min-h-[500px]">
          <LiveMap nodes={nodes} targets={targets} />
        </div>

        {/* Right Column: Status Panels */}
        <div className="lg:col-span-1 flex flex-col space-y-6 h-full overflow-hidden">
          <div className="flex-none h-1/3 min-h-[250px]">
            <NodeStatus nodes={nodes} isConnected={isConnected} />
          </div>
          <div className="flex-1 min-h-[300px] overflow-hidden">
            <SignalTable targets={targets} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
