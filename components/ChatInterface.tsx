'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

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
      let currentContent = '';
      let fileName = selectedFile.name;

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
                // Final complete analysis
                currentContent = data.content;
                setStreamingAnalysis({
                  fileName: data.fileName,
                  content: currentContent,
                  timestamp: new Date(),
                  sessionId: data.sessionId,
                  files: data.files,
                });
              } else if (currentEvent === 'done') {
                // Move streaming analysis to permanent list
                setAnalyses((prev) => [
                  {
                    fileName: data.fileName || fileName,
                    content: currentContent,
                    timestamp: new Date(),
                    sessionId: data.sessionId,
                    files: data.files,
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
      let currentContent = '';

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
                // Final complete reply
                currentContent = data.content;
                setStreamingMessage({
                  role: 'assistant',
                  content: currentContent,
                });
              } else if (currentEvent === 'done') {
                // Move streaming message to permanent list
                setMessages((prev) => [
                  ...prev,
                  { role: 'assistant', content: currentContent },
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
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, something went wrong. Please try again.',
        },
      ]);
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
    <div className="flex flex-col h-screen max-w-6xl mx-auto bg-white dark:bg-black">
      {/* Header */}
      <div className="flex-none p-4 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
              AlphaMiner
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              powered by BorderlessAgent
            </p>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
              Upload financial reports/财报 (PDF, DOCX, TXT) for AI-powered analysis
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors"
            title="登出 (Logout)"
          >
            <span className="flex items-center space-x-2">
              <span>🚪</span>
              <span>登出</span>
            </span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* File Upload Section */}
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            isDragging
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : 'border-zinc-300 dark:border-zinc-700 hover:border-zinc-400'
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
          <div className="space-y-4">
            <div className="text-4xl">📄</div>
            <div>
              <p className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
                Upload Financial Report
              </p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                Drag and drop or click to select
              </p>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-500">
              Supports PDF, DOCX, and TXT files
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Select File
            </button>
          </div>

          {selectedFile && (
            <div className="mt-4 p-4 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <span className="text-2xl">📎</span>
                  <div className="text-left">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                      {selectedFile.name}
                    </p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setSelectedFile(null)}
                    disabled={isLoading}
                    className="px-3 py-1 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={analyzeFile}
                    disabled={isLoading}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isLoading ? 'Analyzing...' : 'Analyze'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Streaming Analysis Section */}
        {streamingAnalysis && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Analysis (Streaming...)
            </h2>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-6 border border-blue-200 dark:border-blue-800 animate-pulse">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-md font-semibold text-zinc-900 dark:text-zinc-50">
                    {streamingAnalysis.fileName}
                  </h3>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                    {streamingAnalysis.timestamp.toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-100" />
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-200" />
                </div>
              </div>
              <div className="mt-4 text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">
                {streamingAnalysis.content}
                <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse ml-1" />
              </div>

              {/* Session Files (for streaming) */}
              {streamingAnalysis.files && streamingAnalysis.files.length > 0 && (
                <div className="mt-4 pt-4 border-t border-blue-200 dark:border-blue-700">
                  <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
                    📎 Session Files ({streamingAnalysis.files.length})
                  </h4>
                  <div className="space-y-2">
                    {streamingAnalysis.files.map((file) => (
                      <div
                        key={file.name}
                        className="flex items-center justify-between p-2 bg-white dark:bg-zinc-800 rounded border border-blue-200 dark:border-blue-700"
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
                              onClick={() => convertMarkdownToPdf(streamingAnalysis.sessionId, file.name)}
                              disabled={convertingFiles.has(file.name)}
                              className="px-3 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              {convertingFiles.has(file.name) ? 'Converting...' : 'Convert to PDF'}
                            </button>
                          )}
                          {isPdfFile(file.originalName) && (
                            <button
                              onClick={() => openPdfPreview(streamingAnalysis.sessionId, file.name)}
                              className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                            >
                              Preview
                            </button>
                          )}
                          <button
                            onClick={() => downloadFile(streamingAnalysis.sessionId, file.name, file.originalName)}
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
                <div className="mt-4 text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">
                  {analysis.content}
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
                    <p className="text-sm whitespace-pre-wrap break-words">
                      {message.content}
                    </p>
                  </div>
                </div>
              ))}

              {/* Streaming Message */}
              {streamingMessage && (
                <div className="flex justify-start">
                  <div className="max-w-[80%] rounded-2xl px-4 py-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-zinc-900 dark:text-zinc-50">
                    <p className="text-sm whitespace-pre-wrap break-words">
                      {streamingMessage.content}
                      <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse ml-1" />
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-zinc-100 dark:bg-zinc-800 rounded-2xl px-4 py-3 max-w-md">
              <div className="flex items-center space-x-3">
                <div className="flex space-x-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-100" />
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-200" />
                </div>
                {progressMessage && (
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">{progressMessage}</p>
                )}
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Chat Input */}
      <div className="flex-none p-4 border-t border-zinc-200 dark:border-zinc-800">
        <form onSubmit={sendMessage} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask follow-up questions about the analysis..."
            disabled={isLoading}
            className="flex-1 px-4 py-3 rounded-full border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-black text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="px-6 py-3 bg-blue-600 text-white rounded-full font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </form>
      </div>

      {/* PDF Preview Modal */}
      {previewPdf && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-700">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                PDF Preview
              </h3>
              <button
                onClick={closePdfPreview}
                className="px-4 py-2 bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 rounded-lg hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors"
              >
                Close
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
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
