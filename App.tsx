
import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { SUPPORTED_LANGUAGES, Language } from './types';
import { decode, decodeAudioData, createPcmBlob } from './utils/audio-utils';
import Visualizer from './components/Visualizer';
import { getTranslation } from './translations';

function resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const newLength = Math.floor(input.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const offset = i * ratio;
    const left = Math.floor(offset);
    const right = Math.ceil(offset);
    const weight = offset - left;
    if (right < input.length) {
      result[i] = input[left] * (1 - weight) + input[right] * weight;
    } else {
      result[i] = input[left];
    }
  }
  return result;
}

const FlagThumbnail: React.FC<{ lang: Language; size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' }> = ({ lang, size = 'md' }) => {
  const sizeClasses = {
    sm: 'w-5 h-3.5',
    md: 'w-6 h-4',
    lg: 'w-10 h-7',
    xl: 'w-32 h-20',
    '2xl': 'w-64 h-40'
  };

  const imgSize = size === 'xl' || size === '2xl' ? 'h120' : 'w40';

  if (lang.countryCode) {
    return (
      <div className={`${sizeClasses[size]} rounded-sm overflow-hidden border border-white/10 shadow-sm flex-shrink-0 bg-slate-800 flex items-center justify-center`}>
        <img 
          src={`https://flagcdn.com/${imgSize}/${lang.countryCode}.png`} 
          alt={lang.name}
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
        />
      </div>
    );
  }

  return <span className={size === 'xl' || size === '2xl' ? 'text-9xl' : 'text-lg'}>{lang.flag}</span>;
};

const App: React.FC = () => {
  const [langA, setLangA] = useState<Language>(SUPPORTED_LANGUAGES[2]); // Português
  const [langB, setLangB] = useState<Language>(SUPPORTED_LANGUAGES[1]); // English
  
  const t = getTranslation(langA.code);
  const [isConnected, setIsConnected] = useState(false);
  const isConnectingRef = useRef(false);
  const isStoppingRef = useRef(false);
  const [isConnecting, setIsConnectingState] = useState(false);
  
  const setIsConnecting = (val: boolean) => {
    isConnectingRef.current = val;
    setIsConnectingState(val);
  };

  const [error, setError] = useState<string | null>(null);
  const [isListening, setIsListeningState] = useState(false);
  const isListeningRef = useRef(false);
  const setIsListening = (val: boolean) => {
    isListeningRef.current = val;
    setIsListeningState(val);
  };
  const [activeSpeaker, setActiveSpeaker] = useState<'A' | 'B' | null>(null);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const isAudioPlayingRef = useRef(false);
  const shouldIgnoreAudioRef = useRef(false);
  
  // Watchdog to reload page if no audio signal is detected while listening
  useEffect(() => {
    if (!isListening || !audioContexts.current?.inputAnalyser) return;

    const analyser = audioContexts.current.inputAnalyser;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let lastSignalTime = Date.now();
    let checkInterval: NodeJS.Timeout;

    const checkSignal = () => {
      analyser.getByteFrequencyData(dataArray);
      const hasSignal = dataArray.some(value => value > 0);
      
      if (hasSignal) {
        lastSignalTime = Date.now();
      } else if (Date.now() - lastSignalTime > 10000) { // 10 seconds of silence
        console.warn('No audio signal detected for 10s. Reloading page...');
        window.location.reload();
      }
    };

    checkInterval = setInterval(checkSignal, 1000);
    return () => clearInterval(checkInterval);
  }, [isListening]);

  const getErrorMessage = useCallback((err: any) => {
    const errorMsg = err?.message?.toLowerCase() || '';
    const errorName = err?.name || '';

    if (errorMsg === 'gemini_api_key is not defined') return t.errorApiKeyMissing;
    if (errorName === 'NotAllowedError') return t.errorMicDenied;
    if (errorName === 'NotFoundError') return t.errorMicNotFound;
    if (errorName === 'OverconstrainedError') return t.micError;
    
    if (errorMsg.includes('quota') || errorMsg.includes('429')) return t.errorQuotaExceeded;
    if (errorMsg.includes('key') || errorMsg.includes('401') || errorMsg.includes('403')) return t.errorInvalidApiKey;
    if (errorMsg.includes('network') || errorMsg.includes('fetch') || errorMsg.includes('failed to connect')) return t.errorNetwork;
    if (errorMsg.includes('location') || errorMsg.includes('unsupported')) return t.errorUnsupportedLocation;
    if (errorMsg.includes('model') || errorMsg.includes('not found')) return t.errorModelNotFound;
    
    return t.errorUnknown;
  }, [t]);

  const sessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const isMountedRef = useRef(true);
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSpeakerRef = useRef<'A' | 'B' | null>(null);
  const toggleSpeakerRef = useRef<((speaker: 'A' | 'B') => void) | null>(null);
  const lastUsedLangsRef = useRef<string>('');
  
  // Buffers for capture and translation
  const captureBufferRef = useRef<Float32Array[]>([]);
  const captureBufferSizeRef = useRef<number>(0);
  const playbackQueueRef = useRef<AudioBuffer[]>([]);
  const isProcessingPlaybackRef = useRef<boolean>(false);
  
  const audioContexts = useRef<{
    input: AudioContext;
    output: AudioContext;
    inputAnalyser: AnalyserNode;
    outputAnalyser: AnalyserNode;
    outputGain: GainNode;
    highPassFilter: BiquadFilterNode;
  } | null>(null);

  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

  const [isReadmeOpen, setIsReadmeOpen] = useState(false);
  const [readmeText, setReadmeText] = useState('');

  const fetchReadme = useCallback(async () => {
    try {
      const response = await fetch('/README.md');
      const text = await response.text();
      setReadmeText(text);
    } catch (err) {
      console.error('Error fetching README:', err);
    }
  }, []);

  useEffect(() => {
    if (isReadmeOpen && !readmeText) {
      fetchReadme();
    }
  }, [isReadmeOpen, readmeText, fetchReadme]);

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
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ 
        sampleRate: 16000,
        latencyHint: 'interactive'
      });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ 
        sampleRate: 24000,
        latencyHint: 'interactive'
      });
      const inputAnalyser = inputCtx.createAnalyser();
      const outputAnalyser = outputCtx.createAnalyser();
      const outputGain = outputCtx.createGain();
      const highPassFilter = inputCtx.createBiquadFilter();
      
      highPassFilter.type = 'highpass';
      highPassFilter.frequency.setValueAtTime(100, inputCtx.currentTime); // Remove low rumble
      
      outputGain.connect(outputAnalyser);
      outputAnalyser.connect(outputCtx.destination);
      audioContexts.current = { input: inputCtx, output: outputCtx, inputAnalyser, outputAnalyser, outputGain, highPassFilter };
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
    shouldIgnoreAudioRef.current = true;
    activeSourcesRef.current.forEach(s => {
      try {
        s.onended = null; // Prevent side effects from stopped sources
        s.stop();
        s.disconnect();
      } catch (e) {}
    });
    activeSourcesRef.current.clear();
    nextStartTimeRef.current = 0;
    setIsAudioPlaying(false);
    isAudioPlayingRef.current = false;
  }, []);

  const cleanupSession = useCallback(() => {
    if (sessionRef.current) {
      try {
        // Remove callbacks to prevent handleStop being called again via onclose
        sessionRef.current.callbacks = {};
        sessionRef.current.close();
      } catch (e) {
        console.warn('Error closing session:', e);
      }
      sessionRef.current = null;
    }
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
      processingTimeoutRef.current = null;
    }
    if (audioWorkletNodeRef.current) {
      audioWorkletNodeRef.current.port.onmessage = null;
      audioWorkletNodeRef.current.disconnect();
      audioWorkletNodeRef.current = null;
    }
    if (micSourceRef.current) {
      micSourceRef.current.disconnect();
      micSourceRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop());
      micStreamRef.current = null;
    }
    stopAllAudio();
  }, [stopAllAudio]);

  const cancelAll = useCallback(() => {
    triggerHaptic('cancel');
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
      processingTimeoutRef.current = null;
    }
    stopAllAudio();
    setIsProcessing(false);
    setIsListening(false);
    // Clear buffers on cancel
    captureBufferRef.current = [];
    captureBufferSizeRef.current = 0;
    playbackQueueRef.current = [];
  }, [stopAllAudio]);

  const toggleSpeaker = useCallback((speaker: 'A' | 'B') => {
    if (!isConnected || isProcessing || isAudioPlayingRef.current) return;

    if (isListeningRef.current && activeSpeaker === speaker) {
      triggerHaptic('stop');
      lastSpeakerRef.current = speaker;
      setIsListening(false);
      setActiveSpeaker(null);
      setIsProcessing(true);
      
      if (processingTimeoutRef.current) clearTimeout(processingTimeoutRef.current);
      processingTimeoutRef.current = setTimeout(() => {
        setIsProcessing(false);
      }, 10000);
    } else {
      triggerHaptic('start');
      stopAllAudio();
      shouldIgnoreAudioRef.current = false;
      setActiveSpeaker(speaker);
      setIsListening(true);
      setIsProcessing(false);
    }
  }, [isConnected, isProcessing, activeSpeaker, setIsListening, stopAllAudio]);

  useEffect(() => {
    toggleSpeakerRef.current = toggleSpeaker;
  }, [toggleSpeaker]);

  const toggleListening = () => {
    // Legacy support or fallback
    if (activeSpeaker) toggleSpeaker(activeSpeaker);
    else toggleSpeaker('A');
  };

  const handleStop = useCallback(async () => {
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;
    
    console.log('Stopping session...');
    setIsConnected(false);
    setIsListening(false);
    setIsProcessing(false);
    cleanupSession();
    
    // Small delay to ensure cleanup is processed
    await new Promise(resolve => setTimeout(resolve, 100));
    isStoppingRef.current = false;
  }, [cleanupSession]);

  const handleStart = useCallback(async () => {
    if (isConnectingRef.current || isStoppingRef.current) return;
    
    console.log('Starting session...');
    // If already connected, ensure we clean up first
    if (sessionRef.current || isConnected) {
      await handleStop();
    }

    setIsConnecting(true);
    setError(null);
    shouldIgnoreAudioRef.current = false;
    lastUsedLangsRef.current = `${langA.code}-${langB.code}`;
    
    try {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is not defined');
      }

      let micStream;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ 
          audio: { 
            deviceId: selectedDeviceId ? { ideal: selectedDeviceId } : undefined, 
            echoCancellation: { ideal: true }, 
            noiseSuppression: { ideal: true }, 
            autoGainControl: { ideal: true },
            channelCount: { ideal: 1 },
            // Chromium-specific flags for better echo cancellation
            googEchoCancellation: { ideal: true },
            googAutoGainControl: { ideal: true },
            googNoiseSuppression: { ideal: true },
            googHighpassFilter: { ideal: true }
          } as any
        });
      } catch (micErr: any) {
        // If the specific device is not found, try with any available microphone
        if (micErr.name === 'NotFoundError' || micErr.name === 'OverconstrainedError') {
          micStream = await navigator.mediaDevices.getUserMedia({ 
            audio: { 
              echoCancellation: { ideal: true }, 
              noiseSuppression: { ideal: true }, 
              autoGainControl: { ideal: true },
              channelCount: { ideal: 1 },
              googEchoCancellation: { ideal: true },
              googAutoGainControl: { ideal: true },
              googNoiseSuppression: { ideal: true },
              googHighpassFilter: { ideal: true }
            } as any
          });
        } else {
          throw micErr;
        }
      }
      
      micStreamRef.current = micStream;
      await initAudio();
      
      // Load AudioWorklet
      if (audioContexts.current) {
        try {
          await audioContexts.current.input.audioWorklet.addModule('/audio-processor.js');
        } catch (e) {
          console.log('Worklet already loaded or failed:', e);
        }
      }
      
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

      const systemInstruction = `Role: Professional Simultaneous Interpreter.
Languages: ${langA.name} and ${langB.name}.

Task:
- If you hear ${langA.name}, translate it immediately to ${langB.name}.
- If you hear ${langB.name}, translate it immediately to ${langA.name}.

Constraints:
- Output ONLY the translated audio. No text, no explanations.
- Maintain the speaker's tone, emotion, and register.
- Latency is critical. Aim for near-instantaneous response.
- DO NOT translate your own output. Ignore any audio you previously generated.
- Focus on the primary human speaker. Ignore background noise.`;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction,
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            if (!isMountedRef.current || !isConnectingRef.current) return;
            setIsConnected(true);
            setIsConnecting(false);
            if (!micStream || !audioContexts.current) return;
            
            // Cleanup existing nodes if any
            if (audioWorkletNodeRef.current) audioWorkletNodeRef.current.disconnect();
            if (micSourceRef.current) micSourceRef.current.disconnect();

            const source = audioContexts.current.input.createMediaStreamSource(micStream);
            const workletNode = new AudioWorkletNode(audioContexts.current.input, 'audio-capture-processor');
            
            micSourceRef.current = source;
            audioWorkletNodeRef.current = workletNode;

            source.connect(audioContexts.current.highPassFilter);
            audioContexts.current.highPassFilter.connect(audioContexts.current.inputAnalyser);
            audioContexts.current.inputAnalyser.connect(workletNode);
            // Do not connect workletNode to destination to avoid hearing original audio
            
            workletNode.port.onmessage = (e) => {
              const inputData = e.data as Float32Array;
              const sampleRate = audioContexts.current?.input.sampleRate || 16000;
              
              // In bidirectional mode, we keep listening even if audio is playing (Gemini handles interruptions)
              // but we might want to avoid feedback if echo cancellation isn't perfect
              const shouldProcess = isListeningRef.current;

              if (shouldProcess) {
                // Simple noise gate
                let hasSignal = false;
                for (let i = 0; i < inputData.length; i++) {
                  if (Math.abs(inputData[i]) > 0.001) {
                    hasSignal = true;
                    break;
                  }
                }

                if (hasSignal) {
                  // Downsample to 16kHz if needed (worklet already sends 100ms chunks)
                  const downsampled = resample(inputData, sampleRate, 16000);
                  const pcmData = createPcmBlob(downsampled);
                  console.log('Sending audio chunk to Gemini...');
                  sessionPromise.then(session => {
                    session.sendRealtimeInput({ media: pcmData });
                  });
                }
              }
            };
          },
          onmessage: async (message: LiveServerMessage) => {
            if (!isMountedRef.current || shouldIgnoreAudioRef.current) return;

            // Detect model turn start to immediately mute mic and prevent feedback
            if (message.serverContent?.modelTurn) {
              if (processingTimeoutRef.current) {
                clearTimeout(processingTimeoutRef.current);
                processingTimeoutRef.current = null;
              }
              setIsProcessing(false);
              setIsAudioPlaying(true);
              isAudioPlayingRef.current = true;
            }

            const modelTurn = message.serverContent?.modelTurn;
            if (modelTurn?.parts && audioContexts.current) {
              console.log('Received translation parts from Gemini:', modelTurn.parts.length);
              for (const part of modelTurn.parts) {
                if (part.inlineData?.data) {
                  const audioData = part.inlineData.data;
                  const { output, outputGain } = audioContexts.current;
                  const buffer = await decodeAudioData(decode(audioData), output, 24000, 1);
                  
                  if (!isMountedRef.current || shouldIgnoreAudioRef.current) return;

                  // Add to playback queue for sequential processing
                  playbackQueueRef.current.push(buffer);
                  
                  const processQueue = () => {
                    if (playbackQueueRef.current.length === 0 || !audioContexts.current) return;
                    
                    const nextBuffer = playbackQueueRef.current.shift()!;
                    const { output: out, outputGain: gain } = audioContexts.current;

                    // Initialize nextStartTime if it's 0
                    if (nextStartTimeRef.current === 0) {
                      nextStartTimeRef.current = out.currentTime + 0.05;
                    } else {
                      nextStartTimeRef.current = Math.max(nextStartTimeRef.current, out.currentTime);
                    }

                    const source = out.createBufferSource();
                    source.buffer = nextBuffer;
                    source.connect(gain);
                    source.onended = () => {
                      activeSourcesRef.current.delete(source);
                      if (activeSourcesRef.current.size === 0 && playbackQueueRef.current.length === 0) {
                        setTimeout(() => {
                          if (!isMountedRef.current) return;
                          setIsAudioPlaying(false);
                          isAudioPlayingRef.current = false;
                          nextStartTimeRef.current = 0;
                          
                          // Auto-swap speaker after playback
                          if (lastSpeakerRef.current && toggleSpeakerRef.current) {
                            const nextSpeaker = lastSpeakerRef.current === 'A' ? 'B' : 'A';
                            lastSpeakerRef.current = null; // Clear it to avoid infinite loops
                            toggleSpeakerRef.current(nextSpeaker);
                          }
                        }, 200);
                      }
                      processQueue(); // Process next in queue
                    };

                    source.start(nextStartTimeRef.current);
                    nextStartTimeRef.current += nextBuffer.duration;
                    activeSourcesRef.current.add(source);
                  };

                  // If not already playing, start processing the queue
                  if (activeSourcesRef.current.size === 0) {
                    processQueue();
                  }
                }
              }
            }

            if (message.serverContent?.interrupted) {
              stopAllAudio();
            }

            // Handle Transcriptions (ASR and NMT results)
            if (message.serverContent?.modelTurn?.parts) {
              // Transcriptions are currently ignored for audio-only mode
            }
            
            const anyMessage = message as any;
            if (anyMessage.serverContent?.userContent?.parts) {
              // User transcriptions are currently ignored for audio-only mode
            }
          },
          onerror: (err: any) => { 
            if (!isMountedRef.current) return;
            console.error('Live API Error:', err);
            
            const msg = err?.message?.toLowerCase() || '';
            // If it's a transient error, try to reconnect once
            if (msg.includes('connection') || msg.includes('timeout') || msg.includes('network')) {
              console.log('Attempting automatic reconnection...');
              handleStop().then(() => {
                if (isMountedRef.current) {
                  setTimeout(() => {
                    if (isMountedRef.current) handleStart();
                  }, 2000);
                }
              });
            } else {
              setError(getErrorMessage(err)); 
              handleStop(); 
            }
          },
          onclose: () => {
            if (isMountedRef.current && !isStoppingRef.current && !isConnectingRef.current) {
              handleStop();
            }
          }
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (err: any) {
      console.error('Start Error:', err);
      setError(getErrorMessage(err));
      if (isMountedRef.current) setIsConnecting(false);
    }
  }, [langA, langB, selectedDeviceId, t, handleStop, initAudio, getErrorMessage]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      cleanupSession();
      if (audioContexts.current) {
        audioContexts.current.input.close();
        audioContexts.current.output.close();
      }
    };
  }, [cleanupSession]);

  useEffect(() => {
    const currentLangs = `${langA.code}-${langB.code}`;
    if (isConnected && !isConnecting && currentLangs !== lastUsedLangsRef.current) {
      const timer = setTimeout(async () => {
        if (!isMountedRef.current) return;
        if (currentLangs === lastUsedLangsRef.current) return; // Double check
        
        console.log('Language changed, restarting session for stability...');
        await handleStop();
        await handleStart();
      }, 800); // Slightly longer debounce
      return () => clearTimeout(timer);
    }
  }, [langA.code, langB.code, isConnected, isConnecting, handleStop, handleStart]);

  return (
    <div className="min-h-screen flex flex-col items-center p-4 md:p-6 space-y-6 max-w-5xl mx-auto selection:bg-blue-500/30">
      <header className="w-full flex justify-between items-center glass p-4 rounded-[2rem] shadow-2xl border-white/5">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center shadow-lg border border-white/10 relative overflow-hidden group">
            <div className="absolute inset-0 bg-white/20 -translate-x-full group-hover:translate-x-0 transition-transform duration-500"></div>
            <img 
              src="https://cdn-icons-png.flaticon.com/512/2885/2885417.png" 
              alt="Polyglot Logo" 
              className="w-8 h-8 relative z-10"
              referrerPolicy="no-referrer"
            />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tighter italic text-white uppercase leading-none">POLY<span className="text-blue-500">GLOT</span></h1>
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-[0.3em] mt-1">{t.simultaneousEngine}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className={`hidden sm:flex items-center space-x-2 px-4 py-2 rounded-full glass border transition-all ${isConnected ? 'border-blue-500/40 bg-blue-500/10' : 'border-slate-800'}`}>
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-blue-400 animate-pulse shadow-[0_0_8px_#60a5fa]' : 'bg-slate-700'}`}></div>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{isConnected ? t.synchronized : t.offline}</span>
          </div>
          <button 
            onClick={() => setIsReadmeOpen(true)}
            className="px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.2em] transition-all border-b-2 bg-slate-800 text-slate-400 border-slate-900 active:border-b-0 translate-y-0 active:translate-y-0.5 hover:bg-slate-700"
          >
            {t.readme}
          </button>
          <button onClick={isConnected ? handleStop : handleStart} disabled={isConnecting} className={`px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.2em] transition-all border-b-2 ${isConnected ? 'bg-slate-800 text-slate-400 border-slate-900 active:border-b-0 translate-y-0 active:translate-y-0.5' : 'bg-blue-600 text-white border-blue-800 shadow-lg shadow-blue-900/20 active:border-b-0 active:translate-y-0.5'}`}>
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
                  <label className="text-[9px] font-black text-slate-400 uppercase ml-1">{t.languageA}</label>
                  <div className="relative group">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none transition-transform group-hover:scale-110 z-10">
                      <FlagThumbnail lang={langA} />
                    </div>
                    <select 
                      className="w-full bg-slate-900 border border-slate-700/50 rounded-2xl pl-12 pr-10 py-3 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none appearance-none cursor-pointer transition-all hover:border-slate-600 text-white" 
                      disabled={isConnecting} 
                      value={langA.code} 
                      onChange={(e) => setLangA(SUPPORTED_LANGUAGES.find(l => l.code === e.target.value)!)}
                    >
                      {SUPPORTED_LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.flag} {t.languages[l.code] || l.name}</option>)}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase ml-1">{t.languageB}</label>
                  <div className="relative group">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none transition-transform group-hover:scale-110 z-10">
                      <FlagThumbnail lang={langB} />
                    </div>
                    <select 
                      className="w-full bg-slate-900 border border-slate-700/50 rounded-2xl pl-12 pr-10 py-3 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none appearance-none cursor-pointer transition-all hover:border-slate-600 text-white" 
                      disabled={isConnecting} 
                      value={langB.code} 
                      onChange={(e) => setLangB(SUPPORTED_LANGUAGES.find(l => l.code === e.target.value)!)}
                    >
                      {SUPPORTED_LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.flag} {t.languages[l.code] || l.name}</option>)}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6">
               <div className="space-y-2">
                 <div className="flex justify-between items-center px-1">
                   <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">{t.micPulse}</span>
                   <span className="text-[8px] font-bold text-blue-500 mono">{t.live}</span>
                 </div>
                 <Visualizer analyser={audioContexts.current?.inputAnalyser || null} color="#3b82f6" isActive={isListening} />
               </div>
               <div className="space-y-2">
                 <div className="flex justify-between items-center px-1">
                   <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">{t.aiRender}</span>
                   <span className="text-[8px] font-bold text-emerald-500 mono">{t.output}</span>
                 </div>
                 <Visualizer analyser={audioContexts.current?.outputAnalyser || null} color="#10b981" isActive={isAudioPlaying} />
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
             ) : (!activeSpeaker && !isProcessing && !isAudioPlaying) ? (
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
               <div className="flex flex-col items-center space-y-10 animate-fade-in w-full">
                 <div className="flex items-center justify-center gap-16 md:gap-32">
                   <div className={`transition-all duration-500 transform ${activeSpeaker === 'A' ? 'scale-110 drop-shadow-[0_0_40px_rgba(59,130,246,0.5)]' : 'opacity-40 grayscale'}`}>
                     <FlagThumbnail lang={langA} size="2xl" />
                   </div>
                   <div className={`transition-all duration-500 transform ${activeSpeaker === 'B' ? 'scale-110 drop-shadow-[0_0_40px_rgba(16,185,129,0.5)]' : 'opacity-40 grayscale'}`}>
                     <FlagThumbnail lang={langB} size="2xl" />
                   </div>
                 </div>
                  <div className={`px-12 py-5 rounded-[2.5rem] border-4 font-black uppercase tracking-[0.4em] text-xs shadow-[0_20px_60px_rgba(0,0,0,0.6)] animate-pulse flex items-center gap-3 ${activeSpeaker === 'A' ? 'bg-blue-600/40 border-blue-500 text-white' : 'bg-emerald-600/40 border-emerald-500 text-white'}`}>
                    <FlagThumbnail lang={activeSpeaker === 'A' ? langA : langB} size="md" />
                    <span>{activeSpeaker === 'A' ? (t.languages[langA.code] || langA.name) : (t.languages[langB.code] || langB.name)} {t.capturing}</span>
                 </div>
               </div>
             )}
             
             <div className={`absolute inset-0 transition-opacity duration-500 pointer-events-none ${activeSpeaker === 'A' ? 'opacity-10' : 'opacity-0'}`} style={{ background: 'radial-gradient(circle, rgba(59,130,246,1) 0%, transparent 70%)' }}></div>
             <div className={`absolute inset-0 transition-opacity duration-500 pointer-events-none ${activeSpeaker === 'B' ? 'opacity-10' : 'opacity-0'}`} style={{ background: 'radial-gradient(circle, rgba(16,185,129,1) 0%, transparent 70%)' }}></div>
          </div>

          <div className="flex justify-center gap-4 pb-8 w-full max-w-2xl">
            <button
              onClick={() => toggleSpeaker('A')}
              disabled={!isConnected || isProcessing || isAudioPlaying || (isListening && activeSpeaker === 'B')}
              className={`flex-1 relative overflow-hidden group flex items-center gap-4 px-6 py-6 rounded-[2.5rem] transition-all border-b-[8px] duration-150 active:border-b-0 active:translate-y-1 ${
                isListening && activeSpeaker === 'A'
                ? 'bg-blue-600 border-blue-800 shadow-[0_0_60px_rgba(59,130,246,0.3)]' 
                : 'bg-slate-800 border-slate-950 hover:bg-slate-700 shadow-xl'
              } disabled:opacity-20 disabled:grayscale disabled:cursor-not-allowed`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg transition-all ${isListening && activeSpeaker === 'A' ? 'bg-white' : 'bg-blue-500'}`}>
                {isListening && activeSpeaker === 'A' ? (
                  <div className="w-4 h-4 bg-blue-600 rounded-sm"></div>
                ) : (
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                )}
              </div>
              <div className="text-left">
                <span className="text-sm font-black uppercase tracking-widest text-white italic block leading-none">
                  {isListening && activeSpeaker === 'A' ? 'Translate' : 'Speaker A'}
                </span>
                <span className="text-[8px] text-slate-400 uppercase font-black mt-1 block tracking-widest opacity-60">
                  {langA.name}
                </span>
              </div>
            </button>

            <button
              onClick={() => toggleSpeaker('B')}
              disabled={!isConnected || isProcessing || isAudioPlaying || (isListening && activeSpeaker === 'A')}
              className={`flex-1 relative overflow-hidden group flex items-center gap-4 px-6 py-6 rounded-[2.5rem] transition-all border-b-[8px] duration-150 active:border-b-0 active:translate-y-1 ${
                isListening && activeSpeaker === 'B'
                ? 'bg-emerald-600 border-emerald-800 shadow-[0_0_60px_rgba(16,185,129,0.3)]' 
                : 'bg-slate-800 border-slate-950 hover:bg-slate-700 shadow-xl'
              } disabled:opacity-20 disabled:grayscale disabled:cursor-not-allowed`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg transition-all ${isListening && activeSpeaker === 'B' ? 'bg-white' : 'bg-emerald-500'}`}>
                {isListening && activeSpeaker === 'B' ? (
                  <div className="w-4 h-4 bg-emerald-600 rounded-sm"></div>
                ) : (
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                )}
              </div>
              <div className="text-left">
                <span className="text-sm font-black uppercase tracking-widest text-white italic block leading-none">
                  {isListening && activeSpeaker === 'B' ? 'Translate' : 'Speaker B'}
                </span>
                <span className="text-[8px] text-slate-400 uppercase font-black mt-1 block tracking-widest opacity-60">
                  {langB.name}
                </span>
              </div>
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
          <div className="flex flex-col flex-1">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">{t.networkStatus}</span>
            <span className="text-sm font-black uppercase tracking-tight italic leading-tight">{error}</span>
          </div>
          <button 
            onClick={() => setError(null)}
            className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {isReadmeOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="glass w-full max-w-4xl max-h-full overflow-hidden rounded-[2.5rem] flex flex-col border border-white/10 shadow-2xl">
            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/5">
              <h2 className="text-xl font-black tracking-tighter italic text-white uppercase leading-none">
                {t.readme}
              </h2>
              <button 
                onClick={() => setIsReadmeOpen(false)}
                className="w-10 h-10 rounded-full bg-slate-800 hover:bg-red-600 text-white flex items-center justify-center transition-colors border border-white/5"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-8 md:p-12 bg-slate-900/50">
              <div className="prose prose-invert max-w-none text-slate-300">
                <ReactMarkdown>{readmeText || 'Loading...'}</ReactMarkdown>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
