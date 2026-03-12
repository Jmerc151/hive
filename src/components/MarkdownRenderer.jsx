import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'

const customStyle = {
  ...vscDarkPlus,
  'pre[class*="language-"]': {
    ...vscDarkPlus['pre[class*="language-"]'],
    background: '#1A1A2E',
    borderRadius: '0.5rem',
    margin: '0.75rem 0',
    fontSize: '0.75rem',
    border: '1px solid #1F2B47',
  },
  'code[class*="language-"]': {
    ...vscDarkPlus['code[class*="language-"]'],
    background: 'transparent',
    fontSize: '0.75rem',
  },
}

function MarkdownRenderer({ content }) {
  if (!content) return null

  return (
    <div className="markdown-output">
      <ReactMarkdown
        components={{
          code({ inline, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '')
            if (!inline && match) {
              return (
                <SyntaxHighlighter
                  style={customStyle}
                  language={match[1]}
                  PreTag="div"
                  {...props}
                >
                  {String(children).replace(/\n$/, '')}
                </SyntaxHighlighter>
              )
            }
            if (!inline && String(children).includes('\n')) {
              return (
                <SyntaxHighlighter
                  style={customStyle}
                  language="text"
                  PreTag="div"
                  {...props}
                >
                  {String(children).replace(/\n$/, '')}
                </SyntaxHighlighter>
              )
            }
            return (
              <code className="bg-hive-700 text-honey px-1.5 py-0.5 rounded text-xs" {...props}>
                {children}
              </code>
            )
          },
          h1: ({ children }) => <h1 className="text-lg font-bold text-hive-100 mt-4 mb-2">{children}</h1>,
          h2: ({ children }) => <h2 className="text-base font-semibold text-hive-100 mt-3 mb-2">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold text-hive-200 mt-2 mb-1">{children}</h3>,
          p: ({ children }) => <p className="text-sm text-hive-200 leading-relaxed mb-2">{children}</p>,
          ul: ({ children }) => <ul className="text-sm text-hive-200 list-disc pl-5 mb-2 space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="text-sm text-hive-200 list-decimal pl-5 mb-2 space-y-0.5">{children}</ol>,
          li: ({ children }) => <li className="text-sm text-hive-200">{children}</li>,
          a: ({ children, href }) => <a href={href} className="text-honey hover:underline" target="_blank" rel="noopener noreferrer">{children}</a>,
          hr: () => <hr className="border-hive-600 my-4" />,
          strong: ({ children }) => <strong className="font-semibold text-hive-100">{children}</strong>,
          blockquote: ({ children }) => <blockquote className="border-l-2 border-honey/40 pl-3 my-2 text-sm text-hive-300 italic">{children}</blockquote>,
          table: ({ children }) => <div className="overflow-x-auto my-2"><table className="text-xs text-hive-200 border-collapse w-full">{children}</table></div>,
          th: ({ children }) => <th className="border border-hive-600 px-2 py-1 bg-hive-700/50 text-left text-hive-100 font-medium">{children}</th>,
          td: ({ children }) => <td className="border border-hive-700 px-2 py-1">{children}</td>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

export default memo(MarkdownRenderer)
