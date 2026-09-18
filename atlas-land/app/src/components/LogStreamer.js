import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Terminal, X, Play, Square, Download, RefreshCw } from 'lucide-react';

/**
 * LogStreamer Component
 * Displays streaming logs from Google Drive based on unique ID
 */
export default function LogStreamer({ uniqueId, onClose, apiBaseUrl = 'http://localhost:5001' }) {
  const [logs, setLogs] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(null);
  const [logFile, setLogFile] = useState(null);
  const [lastPosition, setLastPosition] = useState(0);
  const eventSourceRef = useRef(null);
  const logContainerRef = useRef(null);

  // Load initial log content (last 100 lines)
  const loadInitialLogs = useCallback(async (fileId) => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/logs/${fileId}/tail?lines=100`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setLogs(data.content);
          setLastPosition(data.content.length);
        }
      }
    } catch (err) {
      console.error('Error loading initial logs:', err);
    }
  }, [apiBaseUrl]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // Find log file by unique ID - default to 2025-10-29
  useEffect(() => {
    const findAndLoadLog = async () => {
      try {
        // Use 2025-10-29 as the default/only log file
        const logIdToFind = uniqueId || "2025-10-29";

        console.log('Looking for log file with ID:', logIdToFind);

        // Try to find log by unique ID
        const response = await fetch(`${apiBaseUrl}/api/logs/find/${encodeURIComponent(logIdToFind)}`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.log) {
            console.log('Found log file:', data.log);
            setLogFile(data.log);
            setError(null);
            // Load initial log content
            await loadInitialLogs(data.log.id);
          } else {
            setError(`Log file "app.log.${logIdToFind}" not found`);
          }
        } else {
          const errorData = await response.json().catch(() => ({}));
          setError(`Failed to find log file: ${errorData.message || response.statusText}`);
        }
      } catch (err) {
        console.error('Error finding/loading log:', err);
        setError(`Error finding log file: ${err.message}`);
      }
    };

    findAndLoadLog();
  }, [uniqueId, apiBaseUrl, loadInitialLogs]);

  // Start streaming logs
  const startStreaming = () => {
    if (!logFile || isStreaming) {
      console.log('Cannot start streaming:', { logFile: !!logFile, isStreaming });
      return;
    }

    console.log('Starting log stream for:', logFile.name, 'with uniqueId:', uniqueId);
    setIsStreaming(true);
    setError(null);

    // Close existing connection if any
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // Use the log file's unique ID or the provided uniqueId
    const streamUniqueId = logFile.unique_id || uniqueId || logFile.name.replace('.log', '').replace('app.', '');
    const streamUrl = `${apiBaseUrl}/api/logs/${encodeURIComponent(streamUniqueId)}/stream-by-id?last_position=${lastPosition}`;

    console.log('Connecting to stream URL:', streamUrl);

    // Create new EventSource connection
    const eventSource = new EventSource(streamUrl);

    eventSource.onopen = () => {
      console.log('EventSource connection opened');
      setError(null);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'error' || data.error) {
          console.error('Stream error:', data.error || data.message);
          setError(data.error || data.message);
          setIsStreaming(false);
          eventSource.close();
        } else if (data.type === 'connected') {
          console.log('Stream connected:', data.message);
          // Optionally show connection message
        } else if (data.type === 'heartbeat') {
          console.log('Stream heartbeat - connection alive, position:', data.position);
          // Connection is alive, no new content yet
        } else if (data.type === 'content' || data.content) {
          const content = data.content || '';
          console.log('Received log content:', content.length, 'chars');
          if (content) {
            setLogs((prev) => prev + content);
            setLastPosition(data.position);
          }
        } else {
          // Handle legacy format (no type field)
          if (data.content) {
            setLogs((prev) => prev + data.content);
            setLastPosition(data.position);
          }
        }
      } catch (err) {
        console.error('Error parsing SSE data:', err, event.data);
      }
    };

    eventSource.onerror = (err) => {
      console.error('EventSource error:', err);
      if (eventSource.readyState === EventSource.CLOSED) {
        setError('Connection closed. Click "Start Streaming" to reconnect.');
        setIsStreaming(false);
        eventSource.close();
      } else {
        // Connection is still open, might be a temporary issue
        console.warn('Temporary connection issue, continuing...');
      }
    };

    eventSourceRef.current = eventSource;
  };

  // Stop streaming
  const stopStreaming = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsStreaming(false);
  };

  // Download logs
  const downloadLogs = () => {
    if (!logs) return;

    const blob = new Blob([logs], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = logFile ? `${logFile.name}.txt` : `log-${uniqueId}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Clear logs
  const clearLogs = () => {
    setLogs('');
    setLastPosition(0);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  return (
    <div className="bg-tj-navy-light/50 backdrop-blur-md rounded-xl border border-white/5 shadow-lg flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/5 bg-tj-navy-dark/60 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Terminal className="h-5 w-5 text-tj-gray" />
          <div>
            <h3 className="text-sm font-semibold text-tj-gray">Log Streamer</h3>
            {logFile && (
              <p className="text-xs text-tj-slate">
                {logFile.name} • ID: {uniqueId}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isStreaming && (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <span className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></span>
              Streaming
            </span>
          )}
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-200 rounded transition-colors"
            title="Close"
          >
            <X className="h-4 w-4 text-tj-slate" />
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 p-3 border-b border-white/5 bg-tj-navy-dark/60 backdrop-blur-md">
        {!isStreaming ? (
          <button
            onClick={startStreaming}
            disabled={!logFile}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            <Play className="h-4 w-4" />
            Start Streaming
          </button>
        ) : (
          <button
            onClick={stopStreaming}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
          >
            <Square className="h-4 w-4" />
            Stop Streaming
          </button>
        )}
        <button
          onClick={clearLogs}
          disabled={!logs}
          className="flex items-center gap-2 px-3 py-1.5 text-sm border border-white/10 rounded hover:bg-tj-navy-dark/70/60 backdrop-blur-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Clear
        </button>
        <button
          onClick={downloadLogs}
          disabled={!logs}
          className="flex items-center gap-2 px-3 py-1.5 text-sm border border-white/10 rounded hover:bg-tj-navy-dark/70/60 backdrop-blur-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Download className="h-4 w-4" />
          Download
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mx-4 mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Log Content */}
      <div
        ref={logContainerRef}
        className="flex-1 overflow-y-auto p-4 bg-tj-gold/10 text-tj-gold border border-tj-gold/50 shadow-[0_0_10px_rgba(219,187,28,0.2)] text-green-400 font-mono text-xs"
        style={{ minHeight: '300px' }}
      >
        {!logFile ? (
          <div className="text-tj-slate text-center py-8">
            {uniqueId ? `Loading log file for ${uniqueId}...` : 'Loading most recent log file...'}
          </div>
        ) : logs ? (
          <pre className="whitespace-pre-wrap break-words">{logs}</pre>
        ) : (
          <div className="text-tj-slate text-center py-8">
            <div>Log file loaded: {logFile.name}</div>
            <div className="mt-2 text-xs">Click "Start Streaming" to view real-time logs</div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between p-2 border-t border-white/5 bg-tj-navy-dark/60 backdrop-blur-md text-xs text-tj-slate">
        <span>
          {logs ? `${logs.split('\n').length} lines` : 'No logs'}
        </span>
        {logFile && (
          <span>
            Last updated: {logFile.modified_time ? new Date(logFile.modified_time).toLocaleString() : 'Unknown'}
          </span>
        )}
      </div>
    </div>
  );
}
