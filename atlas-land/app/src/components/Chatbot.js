import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, ExternalLink, Loader2, Search, XCircle, Rocket } from 'lucide-react';
import { API_BASE_URL } from '../config/api';

export default function Chatbot({
  onNavigateToAgent,
  onWorkflowStart,
  onWorkflowComplete,
  messages: externalMessages,
  setMessages: setExternalMessages,
  buildOutputFilename,
  onRunSimulation,
  availableModels = [],
  onModelSelection
}) {
  // Use external messages if provided, otherwise use internal state
  const [internalMessages, setInternalMessages] = useState([
    {
      id: 1,
      text: "Hello! I'm your energy analysis copilot. Type your request and I'll route it to the right agent (Emil, Nova, or Lola) to handle it in the background. You can then visit their tabs to see the work and do more specific tasks.",
      sender: 'bot',
      timestamp: new Date()
    }
  ]);

  const messages = externalMessages || internalMessages;
  const setMessages = setExternalMessages || setInternalMessages;
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const statusPollIntervalRef = useRef(null);
  const activeTaskRef = useRef(null);
  const [chatSelectedModels, setChatSelectedModels] = useState([]);
  const [chatModelSearchTerm, setChatModelSearchTerm] = useState('');

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Monitor buildOutputFilename and show model selection prompt
  useEffect(() => {
    // Check if we've already processed this filename
    if (buildOutputFilename && !messages.some(msg => msg.buildFilename === buildOutputFilename && (msg.isRunPrompt || msg.isRunTriggered))) {
      // Reset model selection for new build completion
      setChatSelectedModels([]);
      setChatModelSearchTerm('');

      // Add message about build completion with model selection prompt
      const completionMessage = {
        id: messages.length + 1,
        text: `✅ Build completed! Model file "${buildOutputFilename}" is ready.\n\n🚀 Please select a model to run the simulation:`,
        sender: 'bot',
        timestamp: new Date(),
        buildFilename: buildOutputFilename,
        isRunPrompt: true, // Mark as prompt so we show model selection UI
        showModelSelection: true
      };
      setMessages(prev => [...prev, completionMessage]);
    }
  }, [buildOutputFilename, messages, setMessages]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (statusPollIntervalRef.current) {
        clearInterval(statusPollIntervalRef.current);
      }
    };
  }, []);

  const pollStatus = async (taskId, agent, agentName, lastUpdate) => {
    try {
      const url = `${API_BASE_URL}/api/copilot/status/${taskId}${lastUpdate ? `?since=${lastUpdate}` : ''}`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.success && data.messages && data.messages.length > 0) {
        // Update the status message with new updates
        setMessages(prev => {
          const updated = [...prev];
          const statusMsgIndex = updated.findIndex(msg => msg.taskId === taskId);

          if (statusMsgIndex !== -1) {
            // Append new status messages
            const newStatusText = data.messages
              .map(msg => {
                if (msg.type === 'starting') return `🔄 ${msg.message}`;
                if (msg.type === 'processing') return `  ${msg.message}`;
                if (msg.type === 'completed') return `✅ ${msg.message}`;
                if (msg.type === 'error') return `❌ ${msg.message}`;
                return msg.message;
              })
              .join('\n');

            updated[statusMsgIndex] = {
              ...updated[statusMsgIndex],
              text: updated[statusMsgIndex].text + '\n' + newStatusText,
              lastUpdate: data.last_update,
              isRunning: !data.completed
            };
          }

          return updated;
        });
      }

      // Stop polling if completed
      if (data.completed) {
        if (statusPollIntervalRef.current) {
          clearInterval(statusPollIntervalRef.current);
          statusPollIntervalRef.current = null;
        }
        activeTaskRef.current = null;

        // Add navigation button to final message
        setMessages(prev => {
          const updated = [...prev];
          const statusMsgIndex = updated.findIndex(msg => msg.taskId === taskId);
          if (statusMsgIndex !== -1) {
            updated[statusMsgIndex] = {
              ...updated[statusMsgIndex],
              agent: agent,
              agentName: agentName,
              isRunning: false
            };
          }
          return updated;
        });
      }
    } catch (error) {
      console.error('Error polling status:', error);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = {
      id: messages.length + 1,
      text: input.trim(),
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    const messageText = input.trim();
    setInput('');
    setIsLoading(true);

    try {
      // Call the workflow generation endpoint (trigger-n8n)
      if (onWorkflowStart) {
        onWorkflowStart();
      }

      const response = await fetch(`${API_BASE_URL}/trigger-n8n`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: messageText,
          n8n_webhook_url: "https://n8n.terajouleenergy.com/webhook/96f1eaeb-7f3c-49a6-bf69-954f56ff602e",
          webhook_base_url: `${API_BASE_URL}/webhook/stage`
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();

      // Add success message
      const statusMessage = {
        id: messages.length + 2,
        text: `Workflow initiated! Your request is being processed. Visit the Build tab to see progress.`,
        sender: 'bot',
        timestamp: new Date(),
        isRunning: true,
        isStatus: true,
        agent: 'emil',
        agentName: 'Emil'
      };

      setMessages(prev => [...prev, statusMessage]);
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => [...prev, {
        id: messages.length + 2,
        text: `Sorry, I encountered an error: ${error.message}. Please try again.`,
        sender: 'bot',
        timestamp: new Date(),
        isError: true
      }]);
      if (onWorkflowComplete) {
        onWorkflowComplete();
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-tj-navy-light/50 backdrop-blur-md rounded-xl border border-white/5 min-h-0">
      {/* Chat Header */}
      <div className="px-4 py-3 border-b border-white/5 bg-tj-navy-dark/60 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-tj-gold" />
          <h3 className="text-sm font-semibold text-tj-gray">Chat Assistant</h3>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${
              message.sender === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            {message.sender === 'bot' && (
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                <Bot className="h-4 w-4 text-tj-gold" />
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-xl px-4 py-2 ${
                message.sender === 'user'
                  ? 'bg-tj-gold text-tj-navy-dark border-none text-white'
                  : message.isError
                  ? 'bg-red-50 text-red-900 border border-red-200'
                  : message.isLoading
                  ? 'bg-blue-50 text-blue-900 border border-blue-200'
                  : message.isStatus
                  ? message.isRunning
                  ? 'bg-blue-50 text-blue-900 border border-blue-200'
                  : 'bg-green-50 text-green-900 border border-green-200'
                  : 'bg-black/30 text-tj-gray'
              }`}
            >
              {message.isLoading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-tj-gold" />
                  <p className="text-sm">{message.text}</p>
                </div>
              ) : (
                <p className="text-sm whitespace-pre-wrap">{message.text}</p>
              )}
              {message.isRunning && !message.isLoading && (
                <div className="mt-2 flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin text-tj-gold" />
                  <span className="text-xs text-tj-gold">Working in background...</span>
                </div>
              )}
              {message.showModelSelection && (
                <div className="mt-3 pt-2 border-t border-white/10">
                  <div className="space-y-3">
                    {/* Search Bar */}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        value={chatModelSearchTerm}
                        onChange={(e) => setChatModelSearchTerm(e.target.value)}
                        placeholder="Search models..."
                        className="w-full pl-10 pr-3 py-2 border border-white/10 rounded-lg focus:ring-2 focus:ring-tj-gold focus:border-transparent text-sm"
                      />
                    </div>

                    {/* Filtered Model List with Checkboxes */}
                    <div className="border border-white/10 rounded-lg max-h-[200px] overflow-y-auto">
                      {availableModels.length === 0 ? (
                        <div className="p-4 text-center text-sm text-tj-slate">
                          No models available
                        </div>
                      ) : (() => {
                        const filteredModels = availableModels.filter(name =>
                          name.toLowerCase().includes(chatModelSearchTerm.toLowerCase())
                        );

                        if (filteredModels.length === 0) {
                          return (
                            <div className="p-4 text-center text-sm text-tj-slate">
                              No models match your search
                            </div>
                          );
                        }

                        return (
                          <div className="p-2">
                            {filteredModels.map((childName) => (
                              <label
                                key={childName}
                                className="flex items-center gap-2 p-2 hover:bg-tj-navy-dark/70/60 backdrop-blur-md rounded cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={chatSelectedModels.includes(childName)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setChatSelectedModels([...chatSelectedModels, childName]);
                                    } else {
                                      setChatSelectedModels(chatSelectedModels.filter(m => m !== childName));
                                    }
                                  }}
                                  className="w-4 h-4 text-tj-gold border-white/10 rounded focus:ring-tj-gold"
                                />
                                <span className="text-sm text-tj-gray flex-1">{childName}</span>
                              </label>
                            ))}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Selected Models Summary */}
                    {chatSelectedModels.length > 0 && (
                      <div className="p-2 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="text-xs font-semibold tracking-wider uppercase text-tj-slate text-blue-900 mb-2">
                          {chatSelectedModels.length} model{chatSelectedModels.length !== 1 ? 's' : ''} selected
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {chatSelectedModels.map((model) => (
                            <span
                              key={model}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded border border-blue-300"
                            >
                              {model}
                              <button
                                type="button"
                                onClick={() => {
                                  setChatSelectedModels(chatSelectedModels.filter(m => m !== model));
                                }}
                                className="hover:text-blue-900 focus:outline-none"
                                aria-label={`Remove ${model}`}
                              >
                                <XCircle className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Run Button */}
                    <button
                      onClick={() => {
                        if (chatSelectedModels.length === 0) {
                          alert('Please select at least one model to run the simulation.');
                          return;
                        }

                        if (onRunSimulation) {
                          // Use the first selected model
                          const modelname = chatSelectedModels[0];
                          onRunSimulation(modelname);

                          // Update message to show user selected and running
                          setMessages(prev => prev.map(msg =>
                            msg.id === message.id
                              ? { ...msg, showModelSelection: false, isRunPrompt: false, isRunTriggered: true, text: msg.text + `\n\n✅ Running simulation with model: "${modelname}"...` }
                              : msg
                          ));
                        }
                      }}
                      disabled={chatSelectedModels.length === 0}
                      className={`w-full px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2 ${
                        chatSelectedModels.length === 0
                          ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                          : 'bg-green-600 text-white hover:bg-green-700'
                      }`}
                    >
                      <Rocket className="h-4 w-4" />
                      <span className="font-medium">Run Simulation</span>
                    </button>
                  </div>
                </div>
              )}
              {message.agent && message.agentName && !message.isRunning && (
                <div className="mt-2 pt-2 border-t border-white/10">
                  <button
                    onClick={() => onNavigateToAgent && onNavigateToAgent(message.agent)}
                    className="flex items-center gap-1 text-xs text-tj-gold hover:text-blue-700 font-medium"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Go to {message.agentName} tab for details and more tasks
                  </button>
                </div>
              )}
              <p className={`text-xs mt-1 ${
                message.sender === 'user' ? 'text-blue-100' : 'text-tj-slate'
              }`}>
                {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            {message.sender === 'user' && (
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                <User className="h-4 w-4 text-tj-slate" />
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-3 justify-start">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
              <Loader2 className="h-4 w-4 text-tj-gold animate-spin" />
            </div>
            <div className="bg-black/30 rounded-xl px-4 py-2">
              <div className="flex items-center gap-2">
                <Loader2 className="h-3 w-3 text-tj-slate animate-spin" />
                <span className="text-xs text-tj-slate">Processing your request...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-white/5 p-4">
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 px-4 py-2 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-tj-gold focus:border-transparent"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="px-4 py-2 bg-tj-gold text-tj-navy-dark border-none text-white rounded-xl hover:bg-tj-gold-hover hover:shadow-[0_0_15px_rgba(219,187,28,0.4)] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
          >
            <Send className="h-4 w-4" />
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
