/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause } from 'lucide-react';

interface VoiceNotePlayerProps {
  url: string;
  initialDuration?: number;
  isMe: boolean;
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  onEnded: () => void;
  addSystemLog: (module: string, message: string) => void;
}

export default function VoiceNotePlayer({
  url,
  initialDuration,
  isMe,
  isPlaying,
  onPlay,
  onPause,
  onEnded,
  addSystemLog
}: VoiceNotePlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [duration, setDuration] = useState<number | null>(initialDuration || null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.play().catch((err: any) => {
          console.error("Audio playback error:", err);
          addSystemLog('AudioHardware', `Playback failed: ${err.message || err}`);
          onEnded();
        });
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying]);

  // Handle cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      const d = audioRef.current.duration;
      if (d && d !== Infinity && !isNaN(d)) {
        setDuration(Math.round(d));
      }
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const current = audioRef.current.currentTime;
      const d = audioRef.current.duration || duration || 1;
      if (d > 0) {
        setProgress((current / d) * 100);
      }
    }
  };

  const handleEnded = () => {
    setProgress(0);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
    onEnded();
  };

  const handleToggle = () => {
    if (isPlaying) {
      onPause();
    } else {
      onPlay();
    }
  };

  return (
    <div className="flex items-center gap-3 select-none">
      <audio
        ref={audioRef}
        src={url}
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        preload="metadata"
      />
      <button
        onClick={handleToggle}
        className={`p-2 rounded-full cursor-pointer transition-all ${
          isMe 
            ? 'bg-black/20 text-white hover:bg-black/30' 
            : 'bg-[#161B22] text-[#1F6FEB] hover:bg-[#30363D]'
        }`}
      >
        {isPlaying ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <div className="flex flex-col">
        <span className="font-semibold text-[10px]">🎙️ Voice Note ({duration ? `${duration}s` : 'Voice'})</span>
        <div className="w-24 h-1.5 bg-black/30 rounded-full mt-1 overflow-hidden relative">
          <div 
            className={`h-full ${isMe ? 'bg-[#58a6ff]' : 'bg-[#1F6FEB]'} transition-all`} 
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
