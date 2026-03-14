import { Fragment } from 'react'

function renderInline(text: string) {
  const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean)

  return tokens.map((token, index) => {
    if (token.startsWith('`') && token.endsWith('`')) {
      return (
        <code
          key={`${token}-${index}`}
          className="rounded bg-emerald-950/10 px-1.5 py-0.5 font-mono text-[0.92em] text-emerald-900"
        >
          {token.slice(1, -1)}
        </code>
      )
    }

    if (token.startsWith('**') && token.endsWith('**')) {
      return (
        <strong key={`${token}-${index}`} className="font-semibold text-foreground">
          {token.slice(2, -2)}
        </strong>
      )
    }

    return <Fragment key={`${token}-${index}`}>{token}</Fragment>
  })
}

function flushList(items: string[], ordered: boolean, key: string) {
  if (items.length === 0) return null

  const ListTag = ordered ? 'ol' : 'ul'
  return (
    <ListTag
      key={key}
      className={ordered ? 'ml-6 list-decimal space-y-2' : 'ml-6 list-disc space-y-2'}
    >
      {items.map((item, index) => (
        <li key={`${key}-${index}`} className="pl-1 leading-7 text-muted-foreground">
          {renderInline(item)}
        </li>
      ))}
    </ListTag>
  )
}

interface KnowledgeMarkdownProps {
  content: string
  className?: string
}

export function KnowledgeMarkdown({ content, className }: KnowledgeMarkdownProps) {
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const elements: React.ReactNode[] = []
  let paragraph: string[] = []
  let listItems: string[] = []
  let orderedItems: string[] = []
  let codeFence = false
  let codeLines: string[] = []

  const flushParagraph = () => {
    if (paragraph.length === 0) return

    const text = paragraph.join(' ').trim()
    elements.push(
      <p key={`paragraph-${elements.length}`} className="leading-7 text-muted-foreground">
        {renderInline(text)}
      </p>,
    )
    paragraph = []
  }

  const flushCodeBlock = () => {
    if (codeLines.length === 0) return

    elements.push(
      <pre
        key={`code-${elements.length}`}
        className="overflow-x-auto rounded-2xl border border-emerald-950/10 bg-emerald-950 px-4 py-4 text-sm text-emerald-50"
      >
        <code>{codeLines.join('\n')}</code>
      </pre>,
    )
    codeLines = []
  }

  const flushLists = () => {
    const unordered = flushList(listItems, false, `ul-${elements.length}`)
    if (unordered) elements.push(unordered)
    const ordered = flushList(orderedItems, true, `ol-${elements.length}`)
    if (ordered) elements.push(ordered)
    listItems = []
    orderedItems = []
  }

  lines.forEach((rawLine) => {
    const line = rawLine.trimEnd()
    const trimmed = line.trim()

    if (trimmed.startsWith('```')) {
      flushParagraph()
      flushLists()

      if (codeFence) {
        flushCodeBlock()
      }

      codeFence = !codeFence
      return
    }

    if (codeFence) {
      codeLines.push(line)
      return
    }

    if (!trimmed) {
      flushParagraph()
      flushLists()
      return
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.*)$/)
    if (heading) {
      flushParagraph()
      flushLists()

      const level = heading[1].length as 1 | 2 | 3
      const text = heading[2]
      const classNameByLevel = {
        1: 'text-3xl font-semibold tracking-tight text-foreground',
        2: 'text-2xl font-semibold tracking-tight text-foreground',
        3: 'text-xl font-semibold tracking-tight text-foreground',
      } as const
      const Tag = `h${level}` as 'h1' | 'h2' | 'h3'

      elements.push(
        <Tag key={`heading-${elements.length}`} className={classNameByLevel[level]}>
          {renderInline(text)}
        </Tag>,
      )
      return
    }

    const orderedItem = trimmed.match(/^\d+\.\s+(.*)$/)
    if (orderedItem) {
      flushParagraph()
      if (listItems.length > 0) flushLists()
      orderedItems.push(orderedItem[1])
      return
    }

    const bulletItem = trimmed.match(/^[-*]\s+(.*)$/)
    if (bulletItem) {
      flushParagraph()
      if (orderedItems.length > 0) flushLists()
      listItems.push(bulletItem[1])
      return
    }

    const blockquote = trimmed.match(/^>\s?(.*)$/)
    if (blockquote) {
      flushParagraph()
      flushLists()
      elements.push(
        <blockquote
          key={`quote-${elements.length}`}
          className="border-l-4 border-orange-300 bg-orange-50/80 px-4 py-3 italic text-orange-900"
        >
          {renderInline(blockquote[1])}
        </blockquote>,
      )
      return
    }

    paragraph.push(trimmed)
  })

  if (codeFence) {
    flushCodeBlock()
  }

  flushParagraph()
  flushLists()

  return <div className={`space-y-4 ${className ?? ''}`}>{elements}</div>
}
