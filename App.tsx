
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { SUPPORTED_LANGUAGES, Language } from './types';
import { decode, decodeAudioData, createPcmBlob } from './utils/audio-utils';
import Visualizer from './components/Visualizer';
import { getTranslation } from './translations';

const App: React.FC = () => {
  const [langA, setLangA] = useState<Language>(SUPPORTED_LANGUAGES[2]); // Português
  const [langB, setLangB] = useState<Language>(SUPPORTED_LANGUAGES[1]); // English
  
  const t = getTranslation(langA.code);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [activeSpeaker, setActiveSpeaker] = useState<'A' | 'B' | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const isAudioPlayingRef = useRef(false);
  
  const activeSpeakerRef = useRef<'A' | 'B' | null>(null);
  const sessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const micStreamRef = useRef<MediaStream | null>(null);
  
  const audioContexts = useRef<{
    input: AudioContext;
    output: AudioContext;
    inputAnalyser: AnalyserNode;
    outputAnalyser: AnalyserNode;
    outputGain: GainNode;
  } | null>(null);

  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

  const getDevices = useCallback(async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(device => device.kind === 'audioinput');
      setAudioDevices(audioInputs);
      if (audioInputs.length > 0 && !selectedDeviceId) {
        const bestDefault = audioInputs.find(d => d.label) || audioInputs[0];
        setSelectedDeviceId(bestDefault.deviceId);
      }
    } catch (err) {
      console.error('Mic error:', err);
    }
  }, [selectedDeviceId]);

  useEffect(() => {
    getDevices();
    const handleDeviceChange = () => getDevices();
    navigator.mediaDevices?.addEventListener('devicechange', handleDeviceChange);
    return () => navigator.mediaDevices?.removeEventListener('devicechange', handleDeviceChange);
  }, [getDevices]);

  const initAudio = async () => {
    if (!audioContexts.current) {
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const inputAnalyser = inputCtx.createAnalyser();
      const outputAnalyser = outputCtx.createAnalyser();
      const outputGain = outputCtx.createGain();
      outputGain.connect(outputAnalyser);
      outputAnalyser.connect(outputCtx.destination);
      audioContexts.current = { input: inputCtx, output: outputCtx, inputAnalyser, outputAnalyser, outputGain };
    }
    if (audioContexts.current.input.state === 'suspended') await audioContexts.current.input.resume();
    if (audioContexts.current.output.state === 'suspended') await audioContexts.current.output.resume();
  };

  const triggerHaptic = (type: 'start' | 'stop' | 'cancel') => {
    if ('vibrate' in navigator) {
      if (type === 'start') navigator.vibrate(20);
      else if (type === 'stop') navigator.vibrate([10, 30, 10]);
      else if (type === 'cancel') navigator.vibrate(50);
    }
  };

  const stopAllAudio = useCallback(() => {
    activeSourcesRef.current.forEach(s => {
      try {
        s.stop();
      } catch (e) {}
    });
    activeSourcesRef.current.clear();
    nextStartTimeRef.current = 0;
    setIsAudioPlaying(false);
    isAudioPlayingRef.current = false;
  }, []);

  const cancelAll = useCallback(() => {
    triggerHaptic('cancel');
    stopAllAudio();
    setIsProcessing(false);
    setActiveSpeaker(null);
    activeSpeakerRef.current = null;
  }, [stopAllAudio]);

  const toggleSpeaking = (speaker: 'A' | 'B') => {
    if (!isConnected || isProcessing || isAudioPlaying) return;

    if (activeSpeakerRef.current === speaker) {
      triggerHaptic('stop');
      setIsProcessing(true);
      setActiveSpeaker(null);
      activeSpeakerRef.current = null;
    } 
    else if (activeSpeakerRef.current === null) {
      triggerHaptic('start');
      stopAllAudio();
      setActiveSpeaker(speaker);
      activeSpeakerRef.current = speaker;
      setIsProcessing(false);
    }
    else {
      cancelAll();
    }
  };

  const handleStop = useCallback(() => {
    sessionRef.current = null;
    setIsConnected(false);
    setActiveSpeaker(null);
    activeSpeakerRef.current = null;
    setIsProcessing(false);
    stopAllAudio();
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop());
      micStreamRef.current = null;
    }
  }, [stopAllAudio]);

  const handleStart = async () => {
    setIsConnecting(true);
    setError(null);
    try {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is not defined');
      }

      const micStream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          deviceId: selectedDeviceId ? { ideal: selectedDeviceId } : undefined, 
          echoCancellation: true, 
          noiseSuppression: true, 
          autoGainControl: false 
        } 
      });
      micStreamRef.current = micStream;
      await initAudio();
      
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const isAutoA = langA.code === 'auto';
      const isAutoB = langB.code === 'auto';
      
      let langInstruction = '';
      if (isAutoA && isAutoB) {
        langInstruction = 'Detect the input language automatically and translate it into the other language being used in the conversation.';
      } else if (isAutoA) {
        langInstruction = `Detect the input language automatically. If it is not ${langB.name}, translate it to ${langB.name}.`;
      } else if (isAutoB) {
        langInstruction = `Detect the input language automatically. If it is not ${langA.name}, translate it to ${langA.name}.`;
      } else {
        langInstruction = `You are a bidirectional simultaneous translator between ${langA.name} and ${langB.name}. 
- If you hear ${langA.name}, translate it immediately to ${langB.name}. 
- If you hear ${langB.name}, translate it immediately to ${langA.name}. 
Be extremely sensitive to the phonetic characteristics of both languages, especially when switching between them.`;
      }

      const systemInstruction = `Role: Professional Simultaneous Translator.
Languages: ${langA.name} and ${langB.name}.
Task: ${langInstruction}
Constraint: AUDIO ONLY. No text output. No preamble. No polite fillers.
Constraint: DO NOT translate your own output. If you hear the translation you just produced, ignore it completely.
Context: This is a live conversation between a speaker of ${langA.name} and a speaker of ${langB.name}. Maintain the tone, emotion, and register of the original speaker.
Timing: Translate immediately when the speaker pauses or when the audio stream stops.
Priority: Ultra-low latency. Ignore background noise and non-speech sounds.`;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction,
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
        },
        callbacks: {
          onopen: () => {
            setIsConnected(true);
            setIsConnecting(false);
            if (!micStream || !audioContexts.current) return;
            const source = audioContexts.current.input.createMediaStreamSource(micStream);
            const scriptProcessor = audioContexts.current.input.createScriptProcessor(2048, 1, 1);
            
            source.connect(audioContexts.current.inputAnalyser);
            audioContexts.current.inputAnalyser.connect(scriptProcessor);
            scriptProcessor.connect(audioContexts.current.input.destination);
            
            scriptProcessor.onaudioprocess = (e) => {
              if (activeSpeakerRef.current !== null && !isAudioPlayingRef.current) {
                const pcmData = createPcmBlob(e.inputBuffer.getChannelData(0));
                sessionPromise.then(session => {
                  session.sendRealtimeInput({ media: pcmData });
                });
              }
            };
          },
          onmessage: async (message: LiveServerMessage) => {
            const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData && audioContexts.current) {
              // Auto-stop user capture when model starts speaking to prevent feedback
              if (activeSpeakerRef.current !== null) {
                setActiveSpeaker(null);
                activeSpeakerRef.current = null;
              }
              
              setIsProcessing(false);
              setIsAudioPlaying(true);
              isAudioPlayingRef.current = true;
              const { output, outputGain } = audioContexts.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, output.currentTime);
              const buffer = await decodeAudioData(decode(audioData), output, 24000, 1);
              const source = output.createBufferSource();
              source.buffer = buffer;
              source.connect(outputGain);
              source.onended = () => {
                activeSourcesRef.current.delete(source);
                if (activeSourcesRef.current.size === 0) {
                  setIsAudioPlaying(false);
                  isAudioPlayingRef.current = false;
                }
              };
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              activeSourcesRef.current.add(source);
            }
          },
          onerror: (err) => { 
            console.error('Live API Error:', err);
            setError(t.connectionError); 
            handleStop(); 
          },
          onclose: () => handleStop()
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (err: any) {
      console.error('Start Error:', err);
      setError(err.message === 'GEMINI_API_KEY is not defined' ? 'API Key missing' : t.micError);
      setIsConnecting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-4 md:p-6 space-y-6 max-w-5xl mx-auto selection:bg-blue-500/30">
      <header className="w-full flex justify-between items-center glass p-4 rounded-[2rem] shadow-2xl border-white/5">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-gradient-to-br from-indigo-600 to-blue-700 rounded-2xl flex items-center justify-center shadow-lg border border-white/10 relative overflow-hidden group">
            <div className="absolute inset-0 bg-white/20 -translate-x-full group-hover:translate-x-0 transition-transform duration-500"></div>
            <svg className="w-7 h-7 text-white relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tighter italic text-white uppercase leading-none">Studio <span className="text-blue-500">Pulse</span></h1>
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-[0.3em] mt-1">{t.simultaneousEngine}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className={`hidden sm:flex items-center space-x-2 px-4 py-2 rounded-full glass border transition-all ${isConnected ? 'border-blue-500/40 bg-blue-500/10' : 'border-slate-800'}`}>
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-blue-400 animate-pulse shadow-[0_0_8px_#60a5fa]' : 'bg-slate-700'}`}></div>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{isConnected ? t.synchronized : t.offline}</span>
          </div>
          <button onClick={isConnected ? handleStop : handleStart} disabled={isConnecting} className={`px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.2em] transition-all border-b-2 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 focus:outline-none ${isConnected ? 'bg-slate-800 text-slate-400 border-slate-900 active:border-b-0 translate-y-0 active:translate-y-0.5' : 'bg-blue-600 text-white border-blue-800 shadow-lg shadow-blue-900/20 active:border-b-0 active:translate-y-0.5'}`}>
            {isConnecting ? t.connecting : isConnected ? t.disconnect : t.connect}
          </button>
        </div>
      </header>

      <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
        <aside className="lg:col-span-3 space-y-4">
          <div className="glass rounded-[2.5rem] p-6 space-y-6 border-white/5 h-full flex flex-col justify-between">
            <div className="space-y-6">
              <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                {t.voiceAndLanguage}
              </h2>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="languageA" className="text-[9px] font-black text-slate-400 uppercase ml-1">{t.languageA}</label>
                  <select id="languageA" className="w-full bg-slate-900 border border-slate-700/50 rounded-2xl px-4 py-3 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none appearance-none cursor-pointer focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900" disabled={isConnected} value={langA.code} onChange={(e) => setLangA(SUPPORTED_LANGUAGES.find(l => l.code === e.target.value)!)}>
                    {SUPPORTED_LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.flag} {t.languages[l.code] || l.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="languageB" className="text-[9px] font-black text-slate-400 uppercase ml-1">{t.languageB}</label>
                  <select id="languageB" className="w-full bg-slate-900 border border-slate-700/50 rounded-2xl px-4 py-3 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none appearance-none cursor-pointer focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900" disabled={isConnected} value={langB.code} onChange={(e) => setLangB(SUPPORTED_LANGUAGES.find(l => l.code === e.target.value)!)}>
                    {SUPPORTED_LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.flag} {t.languages[l.code] || l.name}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="space-y-6">
               <div className="space-y-2">
                 <div className="flex justify-between items-center px-1">
                   <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">{t.micPulse}</span>
                   <span className="text-[8px] font-bold text-blue-500 mono">{t.live}</span>
                 </div>
                 <Visualizer analyser={audioContexts.current?.inputAnalyser || null} color="#3b82f6" isActive={isConnected} />
               </div>
               <div className="space-y-2">
                 <div className="flex justify-between items-center px-1">
                   <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">{t.aiRender}</span>
                   <span className="text-[8px] font-bold text-emerald-500 mono">{t.output}</span>
                 </div>
                 <Visualizer analyser={audioContexts.current?.outputAnalyser || null} color="#10b981" isActive={isConnected} />
               </div>
            </div>

            <div className="p-4 bg-blue-500/5 rounded-[1.5rem] border border-blue-500/10">
               <p className="text-[10px] text-slate-400 font-bold leading-relaxed italic">
                 {t.instruction}
               </p>
            </div>
          </div>
        </aside>

        <main className="lg:col-span-9 flex flex-col gap-6">
          <div className="flex-1 glass rounded-[4rem] flex flex-col items-center justify-center p-8 text-center relative overflow-hidden shadow-2xl border-white/5 min-h-[420px]">
             {!isConnected ? (
               <div className="flex flex-col items-center space-y-8 animate-fade-in">
                 <div className="w-32 h-32 bg-slate-900 rounded-[3rem] flex items-center justify-center border border-slate-800 shadow-inner">
                    <svg className="w-14 h-14 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                 </div>
                 <div className="space-y-2">
                   <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase">{t.studioReady}</h2>
                   <p className="text-slate-500 text-sm font-bold uppercase tracking-widest opacity-50">{t.connectToStart}</p>
                 </div>
               </div>
             ) : (activeSpeaker === null && !isProcessing && !isAudioPlaying) ? (
               <div className="flex flex-col items-center space-y-10 animate-fade-in">
                 <div className="relative">
                    <div className="absolute inset-0 bg-blue-500/20 rounded-full animate-ping scale-[2] opacity-10"></div>
                    <div className="w-28 h-28 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-full flex items-center justify-center relative shadow-2xl border-4 border-white/10">
                        <svg className="w-12 h-12 text-white animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                    </div>
                 </div>
                 <div className="space-y-2">
                   <h2 className="text-3xl font-black text-white uppercase tracking-tighter italic">{t.systemStandby}</h2>
                   <p className="text-blue-400 text-[10px] font-black uppercase tracking-[0.5em] animate-pulse">{t.tapToStart}</p>
                 </div>
               </div>
             ) : (isProcessing || isAudioPlaying) ? (
                <div className="flex flex-col items-center space-y-8 animate-fade-in relative z-10">
                  <div className="flex gap-4">
                    {isProcessing ? (
                      [1,2,3,4,5].map(i => <div key={i} className="w-8 h-8 bg-blue-500 rounded-2xl animate-bounce shadow-xl" style={{ animationDelay: `${i*0.1}s` }}></div>)
                    ) : (
                      <div className="flex items-center gap-2">
                        {[1,2,3,4,5,6,7,8].map(i => (
                          <div key={i} className="w-1 bg-emerald-500 rounded-full animate-[pulse_1s_infinite]" style={{ height: `${Math.random() * 40 + 20}px`, animationDelay: `${i*0.05}s` }}></div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="space-y-4">
                    <h2 className="text-5xl font-black text-white uppercase italic tracking-tighter">
                      {isProcessing ? t.translating : t.playing}
                    </h2>
                    <button 
                      onClick={cancelAll}
                      className="group flex items-center gap-3 px-8 py-3 bg-red-600/20 hover:bg-red-600 border border-red-600/50 rounded-full transition-all duration-300"
                    >
                      <div className="w-4 h-4 bg-red-500 group-hover:bg-white rounded-sm"></div>
                      <span className="text-[10px] font-black uppercase tracking-[0.3em] text-red-500 group-hover:text-white">{t.stopManually}</span>
                    </button>
                  </div>
                </div>
             ) : (
               <div className="flex flex-col items-center space-y-12 animate-fade-in w-full">
                 <div className="flex items-center justify-center gap-16 md:gap-32">
                   <div className={`transition-all duration-300 transform ${activeSpeaker === 'A' ? 'scale-[2.4] drop-shadow-[0_0_60px_rgba(59,130,246,1)]' : 'opacity-5 scale-90 grayscale'}`}>
                     <span className="text-[12rem] leading-none select-none">{langA.flag}</span>
                   </div>
                   <div className={`transition-all duration-300 transform ${activeSpeaker === 'B' ? 'scale-[2.4] drop-shadow-[0_0_60px_rgba(16,185,129,1)]' : 'opacity-5 scale-90 grayscale'}`}>
                     <span className="text-[12rem] leading-none select-none">{langB.flag}</span>
                   </div>
                 </div>
                 <div className={`px-12 py-5 rounded-[2.5rem] border-4 font-black uppercase tracking-[0.4em] text-xs shadow-[0_20px_60px_rgba(0,0,0,0.6)] animate-pulse ${activeSpeaker === 'A' ? 'bg-blue-600/40 border-blue-500 text-white' : 'bg-emerald-600/40 border-emerald-500 text-white'}`}>
                    {activeSpeaker === 'A' ? (t.languages[langA.code] || langA.name) : (t.languages[langB.code] || langB.name)} {t.capturing}
                 </div>
               </div>
             )}
             
             <div className={`absolute inset-0 transition-opacity duration-500 pointer-events-none ${activeSpeaker === 'A' ? 'opacity-20' : 'opacity-0'}`} style={{ background: 'radial-gradient(circle, rgba(59,130,246,1) 0%, transparent 70%)' }}></div>
             <div className={`absolute inset-0 transition-opacity duration-500 pointer-events-none ${activeSpeaker === 'B' ? 'opacity-20' : 'opacity-0'}`} style={{ background: 'radial-gradient(circle, rgba(16,185,129,1) 0%, transparent 70%)' }}></div>
          </div>

          <div className="grid grid-cols-2 gap-8 h-56 pb-4">
            <button
              onClick={() => toggleSpeaking('A')}
              disabled={!isConnected || (activeSpeaker !== null && activeSpeaker !== 'A') || isProcessing || isAudioPlaying}
              aria-label={`${t.capture} ${t.languages[langA.code] || langA.name}`}
              aria-pressed={activeSpeaker === 'A'}
              className={`relative overflow-hidden group flex flex-col items-center justify-center rounded-[3.5rem] transition-all border-b-[12px] duration-150 active:border-b-0 active:translate-y-2 focus-visible:ring-4 focus-visible:ring-blue-500 focus-visible:ring-offset-4 focus-visible:ring-offset-slate-900 focus:outline-none ${
                activeSpeaker === 'A' 
                ? 'bg-red-600 border-red-800 shadow-[0_0_100px_rgba(220,38,38,0.4)] animate-pulse-border' 
                : 'bg-slate-800 border-slate-950 hover:bg-slate-700 shadow-2xl'
              } disabled:opacity-20 disabled:grayscale disabled:cursor-not-allowed`}
            >
              {activeSpeaker === 'A' ? (
                <div className="flex flex-col items-center">
                   <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mb-4 shadow-xl">
                      <div className="w-8 h-8 bg-red-600 rounded-sm"></div>
                   </div>
                   <span className="text-sm font-black uppercase tracking-[0.2em] text-white italic">{t.finishCapture}</span>
                </div>
              ) : (
                <>
                  <span className="text-7xl mb-4 transition-transform group-hover:scale-110 select-none">{langA.flag}</span>
                  <div className="text-center">
                    <span className="text-sm font-black uppercase tracking-[0.2em] text-white block italic">{t.capture} {t.languages[langA.code] || langA.name}</span>
                    <span className="text-[9px] text-slate-500 uppercase font-black mt-2 block tracking-widest opacity-60">{t.tapToBegin}</span>
                  </div>
                </>
              )}
            </button>

            <button
              onClick={() => toggleSpeaking('B')}
              disabled={!isConnected || (activeSpeaker !== null && activeSpeaker !== 'B') || isProcessing || isAudioPlaying}
              aria-label={`${t.capture} ${t.languages[langB.code] || langB.name}`}
              aria-pressed={activeSpeaker === 'B'}
              className={`relative overflow-hidden group flex flex-col items-center justify-center rounded-[3.5rem] transition-all border-b-[12px] duration-150 active:border-b-0 active:translate-y-2 focus-visible:ring-4 focus-visible:ring-blue-500 focus-visible:ring-offset-4 focus-visible:ring-offset-slate-900 focus:outline-none ${
                activeSpeaker === 'B' 
                ? 'bg-red-600 border-red-800 shadow-[0_0_100px_rgba(220,38,38,0.4)] animate-pulse-border' 
                : 'bg-slate-800 border-slate-950 hover:bg-slate-700 shadow-2xl'
              } disabled:opacity-20 disabled:grayscale disabled:cursor-not-allowed`}
            >
              {activeSpeaker === 'B' ? (
                <div className="flex flex-col items-center">
                   <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mb-4 shadow-xl">
                      <div className="w-8 h-8 bg-red-600 rounded-sm"></div>
                   </div>
                   <span className="text-sm font-black uppercase tracking-[0.2em] text-white italic">{t.finishCapture}</span>
                </div>
              ) : (
                <>
                  <span className="text-7xl mb-4 transition-transform group-hover:scale-110 select-none">{langB.flag}</span>
                  <div className="text-center">
                    <span className="text-sm font-black uppercase tracking-[0.2em] text-white block italic">{t.capture} {t.languages[langB.code] || langB.name}</span>
                    <span className="text-[9px] text-slate-500 uppercase font-black mt-2 block tracking-widest opacity-60">{t.tapToBegin}</span>
                  </div>
                </>
              )}
            </button>
          </div>
        </main>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes pulse-border {
          0% { border-color: rgba(220, 38, 38, 1); box-shadow: 0 0 20px rgba(220, 38, 38, 0.4); }
          50% { border-color: rgba(248, 113, 113, 1); box-shadow: 0 0 60px rgba(220, 38, 38, 0.6); }
          100% { border-color: rgba(220, 38, 38, 1); box-shadow: 0 0 20px rgba(220, 38, 38, 0.4); }
        }
        .animate-pulse-border {
          animation: pulse-border 1.5s infinite ease-in-out;
        }
      `}} />

      {error && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-10 py-5 bg-red-600 text-white rounded-[2rem] shadow-2xl flex items-center gap-6 animate-fade-in z-50 border-4 border-red-400 max-w-lg">
          <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center flex-shrink-0">
             <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">{t.networkStatus}</span>
            <span className="text-sm font-black uppercase tracking-tight italic">{error}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
