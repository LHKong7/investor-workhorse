'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import MarkdownRenderer from './MarkdownRenderer';

interface Analysis {
  fileName: string;
  content: string;
  timestamp: Date;
  sessionId: string;
  files?: Array<{
    name: string;
    originalName: string;
    size: number;
  }>;
  analysisSteps?: Array<{
    stepId: string;
    type: 'info' | 'progress' | 'tool_call' | 'thinking' | 'result';
    title: string;
    description?: string;
    timestamp: string;
    duration?: number;
    metadata?: Record<string, any>;
  }>;
}

interface SessionFile {
  name: string;
  originalName: string;
  size: number;
}

// Helper function to check if a file is Markdown
const isMarkdownFile = (filename: string): boolean => {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext === 'md' || ext === 'markdown';
};

// Helper function to check if a file is PDF
const isPdfFile = (filename: string): boolean => {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext === 'pdf';
};

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function ChatInterface() {
  const router = useRouter();
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [progressMessage, setProgressMessage] = useState<string>('');
  const [streamingAnalysis, setStreamingAnalysis] = useState<Analysis | null>(null);
  const [streamingMessage, setStreamingMessage] = useState<Message | null>(null);
  const [convertingFiles, setConvertingFiles] = useState<Set<string>>(new Set());
  const [previewPdf, setPreviewPdf] = useState<{ sessionId: string; filename: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, analyses]);

  const handleFileSelect = (file: File) => {
    const validTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ];
    const validExtensions = ['.pdf', '.docx', '.txt'];
    const fileName = file.name.toLowerCase();
    const hasValidExtension = validExtensions.some(ext => fileName.endsWith(ext));

    if (!hasValidExtension) {
      alert('Please upload a PDF, DOCX, or TXT file.');
      return;
    }

    setSelectedFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const analyzeFile = async () => {
    if (!selectedFile || isLoading) return;

    setIsLoading(true);
    setProgressMessage('Starting analysis...');
    setStreamingAnalysis(null);

    const formData = new FormData();
    formData.append('file', selectedFile);
    if (sessionId) {
      formData.append('sessionId', sessionId);
    }

    // Declare variables outside try block for error handling access
    let currentContent = '';
    let fileName = selectedFile.name;

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || 'Failed to analyze file');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      let buffer = '';
      let currentEvent = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();

          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7);
          } else if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (currentEvent === 'start') {
                fileName = data.fileName;
                setProgressMessage(`Processing ${fileName}...`);
              } else if (currentEvent === 'progress') {
                setProgressMessage(data.message);
              } else if (currentEvent === 'chunk') {
                // Stream content in real-time
                currentContent += data.delta;
                setStreamingAnalysis({
                  fileName,
                  content: currentContent,
                  timestamp: new Date(),
                  sessionId: data.sessionId,
                  files: data.files,
                });
                setProgressMessage('Analyzing...');
              } else if (currentEvent === 'analysis') {
                // Final complete analysis - preserve accumulated content if data.content is empty
                currentContent = data.content || currentContent;
                setStreamingAnalysis({
                  fileName: data.fileName,
                  content: currentContent,
                  timestamp: new Date(),
                  sessionId: data.sessionId,
                  files: data.files,
                  analysisSteps: data.analysisSteps,
                });
              } else if (currentEvent === 'done') {
                // Move streaming analysis to permanent list
                // Ensure we use the accumulated content if data.content is not provided
                const finalContent = data.content || currentContent;
                setAnalyses((prev) => [
                  {
                    fileName: data.fileName || fileName,
                    content: finalContent,
                    timestamp: new Date(),
                    sessionId: data.sessionId,
                    files: data.files,
                    analysisSteps: streamingAnalysis?.analysisSteps || [],
                  },
                  ...prev,
                ]);
                setSessionId(data.sessionId);
                setSelectedFile(null);
                setStreamingAnalysis(null);
                setProgressMessage('');
              } else if (currentEvent === 'error') {
                throw new Error(data.error);
              }

              currentEvent = '';
            } catch (e) {
              // Skip invalid JSON
              continue;
            }
          }
        }
      }
    } catch (error) {
      console.error('Error analyzing file:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to analyze the file. Please try again.';

      // Save any accumulated content before error
      if (currentContent && fileName) {
        setAnalyses((prev) => [
          {
            fileName,
            content: currentContent,
            timestamp: new Date(),
            sessionId: sessionId || '',
            files: [],
          },
          ...prev,
        ]);
      }

      alert(errorMessage);
      setStreamingAnalysis(null);
    } finally {
      setIsLoading(false);
      setProgressMessage('');
    }
  };

  const sendMessage = async (e: React.SyntheticEvent) => {
    e.preventDefault();

    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);
    setProgressMessage('Thinking...');
    setStreamingMessage(null);

    // Declare variable outside try block for error handling access
    let currentContent = '';

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage,
          sessionId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      let buffer = '';
      let currentEvent = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();

          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7);
          } else if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (currentEvent === 'chunk') {
                // Stream content in real-time
                currentContent += data.delta;
                setStreamingMessage({
                  role: 'assistant',
                  content: currentContent,
                });
                setProgressMessage('Responding...');
              } else if (currentEvent === 'reply') {
                // Final complete reply - preserve accumulated content if data.content is empty
                currentContent = data.content || currentContent;
                setStreamingMessage({
                  role: 'assistant',
                  content: currentContent,
                });
              } else if (currentEvent === 'done') {
                // Move streaming message to permanent list
                // Ensure we use the accumulated content if data.content is not provided
                const finalContent = data.content || currentContent;
                setMessages((prev) => [
                  ...prev,
                  { role: 'assistant', content: finalContent },
                ]);
                setSessionId(data.sessionId);
                setStreamingMessage(null);
              } else if (currentEvent === 'error') {
                throw new Error(data.error);
              }

              currentEvent = '';
            } catch (e) {
              continue;
            }
          }
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);

      // Save any accumulated content before error
      if (currentContent) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: currentContent },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: 'Sorry, something went wrong. Please try again.',
          },
        ]);
      }
      setStreamingMessage(null);
    } finally {
      setIsLoading(false);
      setProgressMessage('');
    }
  };

  const convertMarkdownToPdf = async (sessionId: string, filename: string) => {
    if (convertingFiles.has(filename)) return;

    setConvertingFiles(prev => new Set(prev).add(filename));

    try {
      const response = await fetch(`/api/sessions/${sessionId}/convert-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ filename }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || 'Failed to convert to PDF');
      }

      const data = await response.json();

      if (data.success) {
        // Refresh the analyses to show the new PDF file
        setAnalyses(prevAnalyses =>
          prevAnalyses.map(analysis => {
            if (analysis.sessionId === sessionId && analysis.files) {
              // Add the new PDF file to the list
              const newFiles = [...analysis.files, data.pdfFile];
              return { ...analysis, files: newFiles };
            }
            return analysis;
          })
        );

        // Also update streaming analysis if it's the same session
        if (streamingAnalysis?.sessionId === sessionId && streamingAnalysis.files) {
          setStreamingAnalysis({
            ...streamingAnalysis,
            files: [...streamingAnalysis.files, data.pdfFile],
          });
        }

        alert(`PDF generated successfully: ${data.pdfFile.originalName}`);
      }
    } catch (error) {
      console.error('Error converting to PDF:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to convert to PDF. Please try again.';
      alert(errorMessage);
    } finally {
      setConvertingFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(filename);
        return newSet;
      });
    }
  };

  const openPdfPreview = (sessionId: string, filename: string) => {
    setPreviewPdf({ sessionId, filename });
  };

  const closePdfPreview = () => {
    setPreviewPdf(null);
  };

  const downloadFile = (sessionId: string, filename: string, originalName: string) => {
    const url = `/api/sessions/${sessionId}/files/${filename}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = originalName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', {
        method: 'POST',
      });
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
      // 即使出错也重定向到登录页面
      router.push('/login');
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-6xl mx-auto bg-gradient-to-br from-gray-50 to-white dark:from-gray-950 dark:to-black">
      {/* Header */}
      <div className="flex-none px-6 py-4 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-lg border-b border-gray-200 dark:border-zinc-800 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
              <span className="text-xl font-bold text-white">α</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                AlphaMiner
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                AI-Powered Financial Analysis
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="group px-4 py-2.5 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl font-medium hover:from-red-600 hover:to-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-all duration-200 shadow-md hover:shadow-lg"
            title="登出 (Logout)"
          >
            <span className="flex items-center space-x-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span className="hidden sm:inline">登出</span>
            </span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {/* File Upload Section */}
        <div
          className={`relative border-2 border-dashed rounded-2xl p-10 text-center transition-all duration-300 ${
            isDragging
              ? 'border-blue-500 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/30 dark:to-purple-900/30 shadow-lg scale-[1.02]'
              : 'border-gray-300 dark:border-zinc-700 hover:border-blue-400 dark:hover:border-blue-600 bg-white dark:bg-zinc-900/50 shadow-md hover:shadow-lg'
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt"
            onChange={(e) => e.target.files && handleFileSelect(e.target.files[0])}
            className="hidden"
          />
          <div className="space-y-6">
            <div className="flex justify-center">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/50 dark:to-purple-900/50 flex items-center justify-center shadow-inner">
                <svg className="w-10 h-10 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
            </div>
            <div>
              <p className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                Upload Financial Report
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Drag & drop your file here, or browse
              </p>
            </div>
            <div className="flex items-center justify-center space-x-4 text-xs text-gray-500 dark:text-gray-500">
              <span className="flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                <span>PDF</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                <span>DOCX</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                <span>TXT</span>
              </span>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="group px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-md hover:shadow-lg"
            >
              <span className="flex items-center space-x-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <span>Select File</span>
              </span>
            </button>
          </div>

          {selectedFile && (
            <div className="absolute inset-x-0 bottom-0 mx-4 mb-4 p-4 bg-white dark:bg-zinc-800 rounded-xl shadow-lg border border-gray-200 dark:border-zinc-700 animate-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3 flex-1 min-w-0">
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/50 dark:to-purple-900/50 flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                      {selectedFile.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2 flex-shrink-0">
                  <button
                    onClick={() => setSelectedFile(null)}
                    disabled={isLoading}
                    className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-700 rounded-lg transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                  <button
                    onClick={analyzeFile}
                    disabled={isLoading}
                    className="px-5 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg font-semibold hover:from-green-600 hover:to-emerald-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-md hover:shadow-lg"
                  >
                    {isLoading ? (
                      <span className="flex items-center space-x-2">
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span>Analyzing...</span>
                      </span>
                    ) : (
                      <span className="flex items-center space-x-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        <span>Analyze</span>
                      </span>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Streaming Analysis Section */}
        {streamingAnalysis && (
          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
              <h2 className="text-lg font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Live Analysis
              </h2>
            </div>
            <div className="bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-blue-900/20 dark:via-purple-900/20 dark:to-pink-900/20 rounded-2xl p-6 border border-blue-200 dark:border-blue-800 shadow-lg animate-pulse">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                        {streamingAnalysis.fileName}
                      </h3>
                      <p className="text-xs text-gray-600 dark:text-gray-400 flex items-center space-x-2">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>{streamingAnalysis.timestamp.toLocaleString()}</span>
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex-shrink-0">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300">
                    Generating
                  </span>
                </div>
              </div>
              <div className="mt-4 text-sm">
                <MarkdownRenderer content={streamingAnalysis.content} />
                <span className="inline-block w-0.5 h-5 bg-gradient-to-r from-blue-500 to-purple-600 animate-pulse ml-1 align-middle" />
              </div>

              {/* Session Files (for streaming) */}
              {streamingAnalysis.files && streamingAnalysis.files.length > 0 && (
                <div className="mt-6 pt-6 border-t border-blue-200 dark:border-blue-700">
                  <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-3 flex items-center space-x-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    <span>Session Files</span>
                    <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300">
                      {streamingAnalysis.files.length}
                    </span>
                  </h4>
                  <div className="grid grid-cols-1 gap-3">
                    {streamingAnalysis.files.map((file) => (
                      <div
                        key={file.name}
                        className="flex items-center justify-between p-3 bg-white dark:bg-zinc-800 rounded-xl border border-blue-200 dark:border-blue-700 hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-center space-x-3 flex-1 min-w-0">
                          <div className="flex-shrink-0">
                            {isPdfFile(file.originalName) ? (
                              <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                                <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                              </div>
                            ) : isMarkdownFile(file.originalName) ? (
                              <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                                <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </div>
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                                <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                              {file.originalName}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {(file.size / 1024).toFixed(2)} KB
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2 flex-shrink-0">
                          {isMarkdownFile(file.originalName) && (
                            <button
                              onClick={() => convertMarkdownToPdf(streamingAnalysis.sessionId, file.name)}
                              disabled={convertingFiles.has(file.name)}
                              className="inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-lg bg-gradient-to-r from-purple-500 to-purple-600 text-white hover:from-purple-600 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm hover:shadow"
                            >
                              {convertingFiles.has(file.name) ? (
                                <span className="flex items-center space-x-1">
                                  <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                  <span>Converting...</span>
                                </span>
                              ) : (
                                <span className="flex items-center space-x-1">
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                  </svg>
                                  <span>PDF</span>
                                </span>
                              )}
                            </button>
                          )}
                          {isPdfFile(file.originalName) && (
                            <button
                              onClick={() => openPdfPreview(streamingAnalysis.sessionId, file.name)}
                              className="inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-all duration-200 shadow-sm hover:shadow"
                            >
                              <span className="flex items-center space-x-1">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                                <span>Preview</span>
                              </span>
                            </button>
                          )}
                          <button
                            onClick={() => downloadFile(streamingAnalysis.sessionId, file.name, file.originalName)}
                            className="inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 shadow-sm hover:shadow"
                          >
                            <span className="flex items-center space-x-1">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                              <span>Download</span>
                            </span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Analyses Section */}
        {analyses.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Recent Analyses
            </h2>
            {analyses.map((analysis, index) => (
              <div
                key={index}
                className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-6 border border-zinc-200 dark:border-zinc-800"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-md font-semibold text-zinc-900 dark:text-zinc-50">
                      {analysis.fileName}
                    </h3>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                      {analysis.timestamp.toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="mt-4 text-sm">
                  <MarkdownRenderer content={analysis.content} />
                </div>

                {/* Session Files */}
                {analysis.files && analysis.files.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-700">
                    <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
                      📎 Session Files ({analysis.files.length})
                    </h4>
                    <div className="space-y-2">
                      {analysis.files.map((file) => (
                        <div
                          key={file.name}
                          className="flex items-center justify-between p-2 bg-white dark:bg-zinc-800 rounded border border-zinc-200 dark:border-zinc-700 hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
                        >
                          <div className="flex items-center space-x-2">
                            <span className="text-lg">{isPdfFile(file.originalName) ? '📕' : isMarkdownFile(file.originalName) ? '📝' : '📄'}</span>
                            <div>
                              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                                {file.originalName}
                              </p>
                              <p className="text-xs text-zinc-500">
                                {(file.size / 1024).toFixed(2)} KB
                              </p>
                            </div>
                          </div>
                          <div className="flex space-x-2">
                            {isMarkdownFile(file.originalName) && (
                              <button
                                onClick={() => convertMarkdownToPdf(analysis.sessionId, file.name)}
                                disabled={convertingFiles.has(file.name)}
                                className="px-3 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              >
                                {convertingFiles.has(file.name) ? 'Converting...' : 'Convert to PDF'}
                              </button>
                            )}
                            {isPdfFile(file.originalName) && (
                              <button
                                onClick={() => openPdfPreview(analysis.sessionId, file.name)}
                                className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                              >
                                Preview
                              </button>
                            )}
                            <button
                              onClick={() => downloadFile(analysis.sessionId, file.name, file.originalName)}
                              className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                            >
                              Download
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Chat Section */}
        {(messages.length > 0 || streamingMessage) && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Chat
            </h2>
            <div className="space-y-4">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                      message.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50'
                    }`}
                  >
                    <div className="text-sm break-words">
                      <MarkdownRenderer content={message.content} />
                    </div>
                  </div>
                </div>
              ))}

              {/* Streaming Message */}
              {streamingMessage && (
                <div className="flex justify-start">
                  <div className="max-w-[80%] rounded-2xl px-4 py-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-zinc-900 dark:text-zinc-50">
                    <div className="text-sm break-words">
                      <MarkdownRenderer content={streamingMessage.content} />
                      <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse ml-1 align-middle" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-zinc-800 dark:to-zinc-900 rounded-2xl px-5 py-4 max-w-md shadow-md border border-gray-200 dark:border-zinc-700">
              <div className="flex items-center space-x-3">
                <div className="flex space-x-2">
                  <div className="w-2.5 h-2.5 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full animate-bounce"></div>
                  <div className="w-2.5 h-2.5 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2.5 h-2.5 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
                {progressMessage && (
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{progressMessage}</p>
                )}
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Chat Input */}
      <div className="flex-none px-6 py-4 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-lg border-t border-gray-200 dark:border-zinc-800 shadow-lg">
        <form onSubmit={sendMessage} className="flex gap-3 items-end">
          <div className="flex-1 relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask follow-up questions about the analysis..."
              disabled={isLoading}
              className="w-full px-5 py-3.5 pr-12 rounded-2xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
          </div>
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="group px-6 py-3.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-2xl font-semibold hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-md hover:shadow-lg flex-shrink-0"
          >
            <span className="flex items-center space-x-2">
              <span className="hidden sm:inline">Send</span>
              <svg className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </span>
          </button>
        </form>
      </div>

      {/* PDF Preview Modal */}
      {previewPdf && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-7xl h-[92vh] flex flex-col animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800/50 rounded-t-2xl">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-pink-600 flex items-center justify-center shadow-lg">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                    PDF Preview
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {previewPdf.filename}
                  </p>
                </div>
              </div>
              <button
                onClick={closePdfPreview}
                className="group p-2 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 dark:focus:ring-zinc-600"
              >
                <svg className="w-6 h-6 text-gray-600 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-hidden bg-gray-100 dark:bg-zinc-950">
              <iframe
                src={`/api/sessions/${previewPdf.sessionId}/files/${previewPdf.filename}`}
                className="w-full h-full border-0"
                title="PDF Preview"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
