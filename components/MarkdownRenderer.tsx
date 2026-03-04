'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import 'highlight.js/styles/github-dark.css';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export default function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  return (
    <div className={`markdown-content ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight, rehypeRaw]}
        components={{
          // Headings
          h1: ({ node, ...props }) => (
            <h1 className="text-2xl font-bold mt-6 mb-4 text-gray-900 dark:text-white border-b border-gray-200 dark:border-zinc-700 pb-2" {...props} />
          ),
          h2: ({ node, ...props }) => (
            <h2 className="text-xl font-bold mt-5 mb-3 text-gray-900 dark:text-white border-b border-gray-200 dark:border-zinc-700 pb-2" {...props} />
          ),
          h3: ({ node, ...props }) => (
            <h3 className="text-lg font-semibold mt-4 mb-2 text-gray-900 dark:text-white" {...props} />
          ),
          h4: ({ node, ...props }) => (
            <h4 className="text-base font-semibold mt-3 mb-2 text-gray-900 dark:text-white" {...props} />
          ),

          // Paragraphs
          p: ({ node, ...props }) => (
            <p className="mb-4 leading-7 text-gray-800 dark:text-gray-200" {...props} />
          ),

          // Lists
          ul: ({ node, ...props }) => (
            <ul className="mb-4 ml-6 list-disc space-y-2 text-gray-800 dark:text-gray-200" {...props} />
          ),
          ol: ({ node, ...props }) => (
            <ol className="mb-4 ml-6 list-decimal space-y-2 text-gray-800 dark:text-gray-200" {...props} />
          ),
          li: ({ node, ...props }) => (
            <li className="leading-relaxed" {...props} />
          ),

          // Code blocks
          code: ({ node, inline, className, children, ...props }: any) => {
            if (inline) {
              return (
                <code
                  className="px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-zinc-800 text-sm font-mono text-purple-600 dark:text-purple-400 border border-gray-200 dark:border-zinc-700"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code
                className={`block p-4 rounded-lg bg-gray-900 dark:bg-zinc-950 text-sm font-mono text-gray-100 overflow-x-auto border border-gray-700 dark:border-zinc-800 ${className || ''}`}
                {...props}
              >
                {children}
              </code>
            );
          },
          pre: ({ node, ...props }) => (
            <pre className="mb-4 overflow-x-auto" {...props} />
          ),

          // Blockquotes
          blockquote: ({ node, ...props }) => (
            <blockquote
              className="mb-4 pl-4 border-l-4 border-blue-500 italic text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-zinc-800/50 py-2 pr-4 rounded-r-lg"
              {...props}
            />
          ),

          // Tables
          table: ({ node, ...props }) => (
            <div className="mb-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-zinc-700 border border-gray-200 dark:border-zinc-700 rounded-lg overflow-hidden" {...props} />
            </div>
          ),
          thead: ({ node, ...props }) => (
            <thead className="bg-gray-50 dark:bg-zinc-800" {...props} />
          ),
          tbody: ({ node, ...props }) => (
            <tbody className="bg-white dark:bg-zinc-900 divide-y divide-gray-200 dark:divide-zinc-700" {...props} />
          ),
          tr: ({ node, ...props }) => (
            <tr className="hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors" {...props} />
          ),
          th: ({ node, ...props }) => (
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900 dark:text-white uppercase tracking-wider" {...props} />
          ),
          td: ({ node, ...props }) => (
            <td className="px-4 py-3 text-sm text-gray-800 dark:text-gray-200 whitespace-nowrap" {...props} />
          ),

          // Links
          a: ({ node, ...props }) => (
            <a
              className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline font-medium transition-colors"
              target="_blank"
              rel="noopener noreferrer"
              {...props}
            />
          ),

          // Strong and Emphasis
          strong: ({ node, ...props }) => (
            <strong className="font-bold text-gray-900 dark:text-white" {...props} />
          ),
          em: ({ node, ...props }) => (
            <em className="italic text-gray-800 dark:text-gray-200" {...props} />
          ),

          // Horizontal rule
          hr: ({ node, ...props }) => (
            <hr className="my-6 border-t border-gray-300 dark:border-zinc-700" {...props} />
          ),

          // Images
          img: ({ node, ...props }) => (
            <img
              className="rounded-lg shadow-md my-4 max-w-full h-auto"
              alt={props.alt || ''}
              loading="lazy"
              {...props}
            />
          ),
        }}
      >
        {content}
      </ReactMarkdown>

      <style jsx global>{`
        .markdown-content {
          line-height: 1.7;
        }

        .markdown-content p:last-child {
          margin-bottom: 0;
        }

        /* Syntax highlighting overrides */
        .hljs {
          background: transparent !important;
          padding: 0 !important;
        }

        /* Code block language indicators */
        .markdown-content pre > code {
          position: relative;
        }

        /* Better list spacing */
        .markdown-content ul ul,
        .markdown-content ol ul,
        .markdown-content ul ol,
        .markdown-content ol ol {
          margin-bottom: 0;
        }

        /* Table responsive */
        @media (max-width: 640px) {
          .markdown-content table {
            font-size: 0.875rem;
          }

          .markdown-content th,
          .markdown-content td {
            padding: 0.5rem;
          }
        }
      `}</style>
    </div>
  );
}
