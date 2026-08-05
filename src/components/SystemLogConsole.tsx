/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Terminal, Trash2, X, Cpu, HardDrive, Database, ShieldCheck } from 'lucide-react';

export interface SystemLog {
  id: string;
  timestamp: string;
  module: 'Redis' | 'MinIO' | 'FFmpeg' | 'SignalCrypto' | 'MongoDB' | 'System' | string;
  message: string;
}

interface SystemLogConsoleProps {
  logs: SystemLog[];
  onClear: () => void;
  onClose: () => void;
}

export default function SystemLogConsole({ logs, onClear, onClose }: SystemLogConsoleProps) {
  const [moduleFilter, setModuleFilter] = useState<string>('ALL');

  const filteredLogs = moduleFilter === 'ALL'
    ? logs
    : logs.filter(log => log.module === moduleFilter);

  // Get color styles based on the log modules
  const getModuleStyle = (module: string) => {
    switch (module) {
      case 'Redis':
        return 'text-red-400 bg-red-950/40 border-red-900/50';
      case 'MinIO':
        return 'text-sky-400 bg-sky-950/40 border-sky-900/50';
      case 'FFmpeg':
        return 'text-amber-400 bg-amber-950/40 border-amber-900/50';
      case 'SignalCrypto':
        return 'text-emerald-400 bg-emerald-950/40 border-emerald-900/50';
      case 'MongoDB':
        return 'text-teal-400 bg-teal-950/40 border-teal-900/50';
      case 'GeminiAI':
        return 'text-fuchsia-400 bg-fuchsia-950/40 border-fuchsia-900/50';
      default:
        return 'text-slate-400 bg-slate-900/40 border-slate-800';
    }
  };

  const getModuleIcon = (module: string) => {
    switch (module) {
      case 'Redis':
        return <Database size={12} />;
      case 'MinIO':
        return <HardDrive size={12} />;
      case 'FFmpeg':
        return <Cpu size={12} />;
      case 'SignalCrypto':
        return <ShieldCheck size={12} />;
      default:
        return <Terminal size={12} />;
    }
  };

  return (
    <div id="system_log_console" className="hidden lg:flex lg:flex-col h-64 bg-[#0D1117] text-[#E6EDF3] border-t border-[#30363D] font-mono text-[11px] select-none shadow-2xl">
      {/* Console Header */}
      <div className="px-4 py-2 bg-[#161B22] border-b border-[#30363D]/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal size={14} className="text-[#1F6FEB]" />
          <span className="font-bold tracking-wider text-[#F0F6FC]">LINKUP CORE ENGINE CONSOLE (MINIO / FFMPEG / REDIS / CRYPTO)</span>
          <span className="text-[9px] bg-[#0D1117] text-[#8B949E] px-1.5 py-0.5 rounded border border-[#30363D] font-sans font-bold">
            Live Container Ingress
          </span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          {/* Module Filters */}
          <div className="flex items-center gap-1.5 bg-[#0D1117] px-2 py-0.5 rounded border border-[#30363D] font-sans">
            <span className="text-[9px] text-[#8B949E] font-bold uppercase">Filter:</span>
            {['ALL', 'SignalCrypto', 'MinIO', 'FFmpeg', 'Redis', 'MongoDB', 'GeminiAI'].map((mod) => (
              <button
                key={mod}
                onClick={() => setModuleFilter(mod)}
                className={`px-1.5 py-0.5 rounded text-[9px] font-bold cursor-pointer transition-all ${moduleFilter === mod ? 'bg-[#1F6FEB] text-white' : 'text-[#8B949E] hover:text-[#F0F6FC]'}`}
              >
                {mod === 'SignalCrypto' ? 'Crypto' : mod}
              </button>
            ))}
          </div>

          <button
            onClick={onClear}
            title="Clear Console Logs"
            className="p-1 text-[#8B949E] hover:text-rose-400 hover:bg-[#21262D] rounded transition-colors cursor-pointer"
          >
            <Trash2 size={13} />
          </button>
          
          <button
            onClick={onClose}
            title="Close Console Panel"
            className="p-1 text-[#8B949E] hover:text-[#F0F6FC] hover:bg-[#21262D] rounded transition-colors cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Console Log Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1.5 bg-slate-950/80">
        {filteredLogs.map((log) => (
          <div key={log.id} className="flex items-start gap-2.5 leading-relaxed hover:bg-slate-900/40 p-0.5 rounded transition-colors">
            {/* Timestamp */}
            <span className="text-slate-500 shrink-0 select-none">[{log.timestamp}]</span>
            
            {/* Module Name Stamp */}
            <span className={`px-1.5 py-0.5 rounded border text-[9px] font-bold tracking-tight shrink-0 flex items-center gap-1 ${getModuleStyle(log.module)}`}>
              {getModuleIcon(log.module)}
              <span>{log.module.toUpperCase()}</span>
            </span>

            {/* Log Message */}
            <span className="text-slate-300 break-all select-text selection:bg-slate-800 selection:text-emerald-400">{log.message}</span>
          </div>
        ))}

        {filteredLogs.length === 0 && (
          <div className="text-slate-500 text-center py-12 italic">
            Console active. Logs are recorded here dynamically when chats occur, presence changes, or media is processed...
          </div>
        )}
      </div>
    </div>
  );
}
