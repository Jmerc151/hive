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
              <code className="bg-s4 text-t1 px-1.5 py-0.5 rounded text-xs" {...props}>
                {children}
              </code>
            )
          },
          h1: ({ children }) => <h1 className="text-lg font-bold text-t1 mt-4 mb-2">{children}</h1>,
          h2: ({ children }) => <h2 className="text-base font-semibold text-t1 mt-3 mb-2">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold text-t1 mt-2 mb-1">{children}</h3>,
          p: ({ children }) => <p className="text-sm text-t1 leading-relaxed mb-2">{children}</p>,
          ul: ({ children }) => <ul className="text-sm text-t1 list-disc pl-5 mb-2 space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="text-sm text-t1 list-decimal pl-5 mb-2 space-y-0.5">{children}</ol>,
          li: ({ children }) => <li className="text-sm text-t1">{children}</li>,
          a: ({ children, href }) => <a href={href} className="text-t1 hover:underline" target="_blank" rel="noopener noreferrer">{children}</a>,
          hr: () => <hr className="border-s4 my-4" />,
          strong: ({ children }) => <strong className="font-semibold text-t1">{children}</strong>,
          blockquote: ({ children }) => <blockquote className="border-l-2 border-honey/40 pl-3 my-2 text-sm text-t2 italic">{children}</blockquote>,
          table: ({ children }) => <div className="overflow-x-auto my-2"><table className="text-xs text-t1 border-collapse w-full">{children}</table></div>,
          th: ({ children }) => <th className="border border-s4 px-2 py-1 bg-s3 text-left text-t1 font-medium">{children}</th>,
          td: ({ children }) => <td className="border border-s4 px-2 py-1">{children}</td>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

export default memo(MarkdownRenderer)
