import React from 'react';
import { MicOff, VolumeX } from 'lucide-react';

export default function EmilVoiceLauncher({ voice, onOpen }) {
  const expanded = voice.active || voice.speaking || Boolean(voice.error);
  const label = voice.error ? 'Voice needs attention' : voice.statusLabel;
  return <div className="flex max-w-[calc(100vw-32px)] items-center gap-2">
    <button type="button" onClick={onOpen} aria-label="Open map assistant"
      title={expanded ? `Open conversation · ${voice.error || label}` : 'Open assistant'}
      className={`${expanded ? 'h-12 px-2 gap-2' : 'h-12 w-12'} min-w-0 rounded-full shadow-lg border flex items-center justify-center hover:brightness-105`}
      style={{ background: 'var(--bg-overlay)', borderColor: 'var(--border-strong)', color: 'var(--text-primary)' }}>
      <img src={`${process.env.PUBLIC_URL || ''}/nohm-emil-idle.svg`} alt="" aria-hidden="true" className="h-9 w-9 shrink-0" />
      {expanded && <span className="min-w-0 max-w-[150px] truncate text-[11px] font-semibold">{label}</span>}
    </button>
    {voice.active && <button type="button" onClick={voice.stop}
      aria-label="Stop live voice" title="Stop microphone and EMIL speech"
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/25 bg-[#071421] text-white shadow-lg hover:bg-slate-700">
      <MicOff className="h-4 w-4" />
    </button>}
    {voice.speaking && <button type="button" onClick={voice.cancelSpeech}
      aria-label="Stop EMIL speaking" title="Stop speech without stopping the microphone"
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/25 bg-[#071421] text-white shadow-lg hover:bg-slate-700">
      <VolumeX className="h-4 w-4" />
    </button>}
  </div>;
}
