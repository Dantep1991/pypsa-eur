import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Loader2, MapPin, Volume2 } from 'lucide-react';
import { API_BASE_URL, ENDPOINTS } from '../config/api';

export default function VoiceRecorder({ onLocationDetected }) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState(null);
  const [recognition, setRecognition] = useState(null);
  const recognitionRef = useRef(null);
  const recordingIntentRef = useRef(false);
  const [finalTranscript, setFinalTranscript] = useState('');
  const finalTranscriptRef = useRef('');
  const interimRef = useRef('');
  const [conversionStatus, setConversionStatus] = useState('');
  const [hasMicPermission, setHasMicPermission] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isCompact, setIsCompact] = useState(false);
  const [lastDetection, setLastDetection] = useState(null); // { latitude, longitude, description }

  const processLocationWithLLM = React.useCallback(async (text) => {
    console.log('Attempting to process location with backend:', text);
    setIsProcessing(true);
    let timeoutId;

    try {
      setConversionStatus('Processing location...');
      const apiUrl = `${API_BASE_URL}${ENDPOINTS.PARSE_LOCATION}`;
      console.log(`Making API request to ${apiUrl}`);

      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 30000); // Increased to 30 seconds

      const response = await fetch(apiUrl, {
        signal: controller.signal,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ text }),
      });

      console.log('API response status:', response.status);
      const responseText = await response.text();
      console.log('API response text:', responseText);

      if (!response.ok) {
        let errorMessage = 'Failed to process location';
        try {
          const errorData = JSON.parse(responseText);
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch (e) {
          errorMessage = `Server error (${response.status}): ${responseText}`;
        }
        throw new Error(errorMessage);
      }

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        console.error('Failed to parse JSON response:', e);
        throw new Error('Invalid response from server');
      }

      console.log('Parsed API response:', data);

      if (data.latitude && data.longitude) {
        console.log('Location detected:', { lat: data.latitude, lng: data.longitude });
        const payload = {
          latitude: data.latitude,
          longitude: data.longitude,
          description: text,
        };
        onLocationDetected(payload);
        // Remember last detection and collapse UI for compact mode
        setLastDetection(payload);
        setIsCompact(true);
      } else {
        console.error('No coordinates in response:', data);
        throw new Error('Could not determine location coordinates.');
      }
    } catch (err) {
      console.error('Error processing location:', err);
      if (err.name === 'AbortError') {
        throw new Error('Request timed out. Please check your connection and try again.');
      } else if (!navigator.onLine) {
        throw new Error('No internet connection. Please check your network and try again.');
      } else if (err.message.includes('Failed to fetch')) {
        throw new Error('Could not connect to the server. Please ensure the backend is running.');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
      setIsProcessing(false);
      setTranscript('');
      setFinalTranscript('');
    }
  }, [onLocationDetected]);

  // Initialize speech recognition instance once
  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      if (recognitionRef.current) return;

      try {
        setIsInitializing(true);
        console.log('[VR] Initializing speech recognition...');

        if (!('SpeechRecognition' in window) && !('webkitSpeechRecognition' in window)) {
          throw new Error('Speech recognition is not supported in this browser.');
        }

        console.log('[VR] Requesting microphone permission...');
        try {
          const stream = await Promise.race([
            navigator.mediaDevices.getUserMedia({ audio: true }),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Microphone permission timeout')), 5000)
            )
          ]);
          stream.getTracks().forEach(t => t.stop());
          if (!isMounted) return;
          console.log('[VR] Microphone permission granted');
          setHasMicPermission(true);
        } catch (permErr) {
          console.error('[VR] Microphone permission error:', permErr);
          throw new Error('Microphone access denied or unavailable. Please check browser permissions.');
        }

        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        const instance = new SR();
        instance.continuous = true;
        instance.interimResults = true;
        instance.lang = 'en-US';

        instance.onstart = () => {
          console.log('[VR] onstart fired - recognition actually started');
          if (!isMounted) return;
          setIsRecording(true);
          setConversionStatus('Listening...');
          setError(null);
        };

        instance.onresult = (event) => {
          if (!isMounted) return;
          console.log('[VR] onresult fired, results:', event.results);
          let interim = '';
          let finals = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const chunk = event.results[i][0].transcript;
            console.log(`[VR] Result ${i}: "${chunk}" (isFinal: ${event.results[i].isFinal})`);
            if (event.results[i].isFinal) {
              finals += chunk;
            } else {
              interim += chunk;
            }
          }

          if (finals) {
            finalTranscriptRef.current = (finalTranscriptRef.current + ' ' + finals).trim();
            setFinalTranscript(prev => (prev + ' ' + finals).trim());
            console.log('[VR] Final transcript updated:', finalTranscriptRef.current);
          }
          if (interim) {
            console.log('[VR] Interim transcript:', interim);
          }
          interimRef.current = interim;
          setTranscript(interim);
        };

        instance.onerror = (event) => {
          console.error('[VR] onerror', event.error);
          if (!isMounted) return;

          // Ignore aborted errors (benign during restarts)
          if (event.error === 'aborted') return;

          // Handle network errors - stop trying to restart
          if (event.error === 'network') {
            console.error('[VR] Network error - stopping recognition');
            recordingIntentRef.current = false;
            setIsRecording(false);
            setConversionStatus('');
            setError('Network error: Speech recognition requires internet connection. Please check your connection and try again.');
            return;
          }

          // Handle other errors
          let errorMessage = event.error;
          if (event.error === 'no-speech') {
            errorMessage = 'No speech detected. Try speaking again.';
          } else if (event.error === 'audio-capture') {
            errorMessage = 'Microphone not accessible. Please check your microphone.';
          } else if (event.error === 'not-allowed') {
            errorMessage = 'Microphone permission denied. Please allow microphone access.';
          }

          setError(errorMessage);
          setIsRecording(false);
        };

        instance.onend = () => {
          console.log('[VR] onend fired; recordingIntentRef=', recordingIntentRef.current);
          if (!isMounted) return;
          setIsRecording(false);

          if (recordingIntentRef.current) {
            // Attempt restart (continuous recording mode)
            try {
              instance.start();
              console.log('[VR] restarted recognition');
            } catch (e) {
              console.error('[VR] restart failed', e);
              setError('Could not continue listening. Tap mic to retry.');
              recordingIntentRef.current = false;
            }
          }
          // Note: Text processing is now handled in stopRecording() to avoid issues with network errors
          // preventing onend from firing properly
        };

        recognitionRef.current = instance;
        setRecognition(instance);
        setError(null);
      } catch (e) {
        console.error('[VR] init error', e);
        if (isMounted) setError(e.message || 'Initialization failed');
      } finally {
        if (isMounted) setIsInitializing(false);
      }
    };

    init();
    return () => {
      isMounted = false;
      const inst = recognitionRef.current;
      if (inst) {
        try {
          inst.onresult = inst.onend = inst.onerror = inst.onstart = null;
          inst.stop();
        } catch (_) { }
      }
    };
  }, [processLocationWithLLM]);

  const startRecording = async () => {
    console.log('[VR] startRecording called, state:', {
      isInitializing,
      hasMicPermission,
      hasInstance: !!recognitionRef.current,
      intent: recordingIntentRef.current
    });

    if (isInitializing) {
      console.log('[VR] Still initializing, please wait');
      setError('Still initializing, please wait...');
      return;
    }

    if (!hasMicPermission) {
      console.log('[VR] No mic permission');
      setError('Microphone permission required.');
      return;
    }

    const inst = recognitionRef.current;
    if (!inst) {
      console.log('[VR] No recognition instance');
      setError('Not ready yet.');
      return;
    }

    if (recordingIntentRef.current) {
      console.log('[VR] Already recording or starting');
      return;
    }

    recordingIntentRef.current = true;
    setError(null);
    setTranscript('');
    setFinalTranscript('');
    finalTranscriptRef.current = '';
    interimRef.current = '';
    setConversionStatus('Starting...');
    // Expand out of compact mode while actively recording
    if (isCompact) setIsCompact(false);

    try {
      console.log('[VR] Attempting to start recognition...');
      await inst.start();
      console.log('[VR] Recognition start() called successfully');

      // Timeout to detect if onstart never fires
      setTimeout(() => {
        if (recordingIntentRef.current && !isRecording) {
          console.warn('[VR] onstart never fired within 3 seconds');
          recordingIntentRef.current = false;
          setConversionStatus('');
          setError('Recognition failed to start. Please try again.');
        }
      }, 3000);

    } catch (e) {
      console.error('[VR] Start failed:', e);
      recordingIntentRef.current = false;
      setIsRecording(false);
      setConversionStatus('');

      if (e.name === 'InvalidStateError') {
        setError('Recognition already running. Please try again.');
      } else if (e.name === 'NotAllowedError') {
        setError('Microphone access denied. Please check browser permissions.');
      } else {
        setError(e.message || 'Could not start listening');
      }
    }
  };

  const stopRecording = () => {
    const inst = recognitionRef.current;
    recordingIntentRef.current = false;
    if (!inst) return;

    // Capture the text BEFORE stopping (in case errors prevent onend from processing)
    const textToProcess = (finalTranscriptRef.current || interimRef.current || '').trim();
    console.log('[VR] stop requested, captured text:', textToProcess);

    try {
      inst.stop();
      setConversionStatus('Finishing...');

      // Process immediately if we have text (don't wait for onend which might not fire due to errors)
      if (textToProcess) {
        console.log('[VR] Processing text immediately on stop:', textToProcess);
        setConversionStatus('Sending to location parser...');
        processLocationWithLLM(textToProcess).catch(err => {
          console.error('[VR] Processing error:', err);
          setError(err.message);
        }).finally(() => {
          finalTranscriptRef.current = '';
          interimRef.current = '';
          setTranscript('');
          setFinalTranscript('');
        });
      }
    } catch (e) {
      console.error('[VR] stop error', e);
      // Even if stop fails, try to process the text we captured
      if (textToProcess) {
        console.log('[VR] Stop failed but processing text anyway:', textToProcess);
        setConversionStatus('Sending to location parser...');
        processLocationWithLLM(textToProcess).catch(err => {
          console.error('[VR] Processing error:', err);
          setError(err.message);
        }).finally(() => {
          finalTranscriptRef.current = '';
          interimRef.current = '';
          setTranscript('');
          setFinalTranscript('');
        });
      } else {
        setError(e.message || 'Could not stop.');
      }
    }
  };

  // Compact summary view shown after a successful detection when idle
  if (isCompact && !isRecording && !isProcessing && !isInitializing && lastDetection) {
    const { latitude, longitude, description } = lastDetection;
    return (
      <div className="flex items-center justify-between gap-3 p-2 bg-tj-navy-light/50 backdrop-blur-md rounded-lg border border-white/5 w-full">
        <button
          onClick={startRecording}
          className={`flex items-center justify-center w-9 h-9 rounded-full bg-tj-gold/20 text-tj-gold border border-tj-gold/50 shadow-[0_0_10px_rgba(219,187,28,0.2)] hover:bg-tj-gold/40 backdrop-blur-md transition-colors`}
          title="Start new voice search"
        >
          <Mic className="w-5 h-5 text-white" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-tj-gray truncate" title={description || ''}>
            {description || 'Last location'}
          </div>
          <div className="text-xs text-tj-slate truncate">
            {typeof latitude === 'number' && typeof longitude === 'number'
              ? `(${latitude.toFixed(3)}, ${longitude.toFixed(3)})`
              : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsCompact(false)}
            className="px-2.5 py-1.5 text-xs border border-white/10 rounded-lg text-tj-gray hover:bg-tj-navy-dark/70/60 backdrop-blur-md"
          >
            Search again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Title */}
      <div className="text-left">
        <h3 className="text-md font-semibold text-white tracking-wide">Voice Location Input</h3>
      </div>

      {/* Record Button */}
      <div className="flex justify-center">
        <button
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isProcessing || isInitializing}
          className={`relative flex items-center justify-center w-16 h-16 rounded-full transition-all ${isRecording ? 'bg-tj-gold text-tj-navy-dark shadow-[0_0_20px_rgba(219,187,28,0.6)]' : 'bg-tj-gold/80 text-tj-navy-dark hover:bg-tj-gold hover:shadow-[0_0_15px_rgba(219,187,28,0.4)] backdrop-blur-md'
            } ${(isProcessing || isInitializing) ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {/* Ripple effect when recording */}
          {isRecording && (
            <>
              <div className="absolute w-full h-full rounded-full bg-tj-gold/10 text-tj-gold border border-tj-gold/50 shadow-[0_0_10px_rgba(219,187,28,0.2)] animate-ping opacity-75"></div>
              <div className="absolute w-full h-full rounded-full bg-tj-gold/10 text-tj-gold border border-tj-gold/50 shadow-[0_0_10px_rgba(219,187,28,0.2)] animate-pulse"></div>
            </>
          )}
          {isRecording ? (
            <MicOff className="w-8 h-8 text-white" />
          ) : (
            <Mic className="w-8 h-8 text-white" />
          )}
        </button>
      </div>

      {/* Status Text */}
      <div className="text-center">
        {isRecording && (
          <div className="text-red-500 font-medium animate-pulse">
            Recording... Click to stop
          </div>
        )}
        {isProcessing && (
          <div className="flex items-center justify-center gap-2 text-tj-gold">
            <Loader2 className="w-4 h-4 animate-spin" />
            Processing location...
          </div>
        )}
        {isInitializing && (
          <div className="text-tj-slate">
            Initializing speech recognition...
          </div>
        )}
      </div>

      {/* Transcript */}
      {(transcript || finalTranscript) && !isProcessing && (
        <div className="w-full bg-tj-navy-dark/60 backdrop-blur-md rounded-xl p-3">
          <div className="text-xs text-tj-slate mb-1 text-left">Detected Speech:</div>
          <div className="flex items-start gap-2">
            <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
            <div className="text-left">
              {finalTranscript && (
                <div className="text-tj-gray font-medium">{finalTranscript}</div>
              )}
              {transcript && (
                <div className="text-tj-slate italic">{transcript}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="text-red-500 text-sm text-left">
          {error}
        </div>
      )}

      {/* Voice to Text Status */}
      {conversionStatus && (
        <div className="flex items-center justify-center gap-2 text-tj-gold">
          <Volume2 className="w-4 h-4 animate-pulse" />
          <span>{conversionStatus}</span>
        </div>
      )}

      {/* Manual Text Input - Always visible as primary method */}
      <div className="w-full">
        <div className="text-sm text-white font-semibold mb-2 tracking-wide font-medium text-left">
          {error && error.includes('Network error') ? 'Enter location manually:' : 'Or type location:'}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="e.g., Paris France, LeBlanc in France, New York City"
            className="flex-1 px-3 py-2 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-tj-gold text-sm bg-tj-navy-dark/30 text-white placeholder-gray-400 backdrop-blur-md"
            disabled={isProcessing}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && e.target.value.trim() && !isProcessing) {
                const text = e.target.value.trim();
                console.log('[VR] Manual input submitted:', text);
                processLocationWithLLM(text).catch(err => {
                  console.error('[VR] Manual processing error:', err);
                  setError(err.message);
                });
                e.target.value = '';
              }
            }}
          />
          <button
            onClick={(e) => {
              const input = e.target.previousElementSibling;
              if (input.value.trim() && !isProcessing) {
                const text = input.value.trim();
                console.log('[VR] Manual input submitted:', text);
                processLocationWithLLM(text).catch(err => {
                  console.error('[VR] Manual processing error:', err);
                  setError(err.message);
                });
                input.value = '';
              }
            }}
            disabled={isProcessing}
            className="px-4 py-2 bg-tj-gold/20 text-tj-gold border border-tj-gold/50 shadow-[0_0_10px_rgba(219,187,28,0.1)] rounded-lg hover:bg-tj-gold/40 backdrop-blur-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? 'Processing...' : 'Send'}
          </button>
        </div>
        {lastDetection && !isProcessing && !isRecording && (
          <div className="mt-3 text-xs text-tj-slate text-left">
            Last: {lastDetection.description || 'location'}{' '}
            {typeof lastDetection.latitude === 'number' && typeof lastDetection.longitude === 'number'
              ? `(${lastDetection.latitude.toFixed(3)}, ${lastDetection.longitude.toFixed(3)})`
              : null}
          </div>
        )}
      </div>

    </div>
  );
}