import { strToU8, zipSync } from 'fflate';
import type { StreamNodeWithIndex } from '../types';
import { aggregateEmojiReactions } from '../utils/reactionUtils';

export type ExportOrder = 'doc' | 'time';
export type ExportSelection = ExportOrder | 'both';
export type TimeDirection = 'asc' | 'desc';
export type ExportFormat = 'text' | 'markdown' | 'cosense' | 'html';

export interface ExportOptions {
  order: ExportOrder;
  direction: TimeDirection;
  includeAuthor: boolean;
  includeTime: boolean;
  includeReactions: boolean;
  format: ExportFormat;
  useRealName?: boolean;
}

export interface ExportSettings {
  format: ExportFormat;
  doc: Pick<ExportOptions, 'includeAuthor' | 'includeTime' | 'includeReactions'>;
  time: Pick<ExportOptions, 'includeAuthor' | 'includeTime' | 'includeReactions'>;
  direction: TimeDirection;
}

export const EXPORT_DEFAULTS = {
  format: 'text' as ExportFormat,
  timeDirection: 'asc' as TimeDirection,
  timeReactions: true,
  useRealName: false,
  multiline: 'preserve' as const,
  trimDocumentBlankEdges: true,
};

export interface ExportResult {
  text: string;
  html: string;
  lines: number;
}

const escapeHtml = (value: string): string => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const formatDate = (timestamp: number): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(timestamp));
  const get = (type: string) => parts.find(part => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
};

const formatTime = (timestamp: number): string => new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
}).format(new Date(timestamp));

export const getOutputStamp = (timestamp = Date.now()): string => formatDate(timestamp);

const reactionText = (node: StreamNodeWithIndex['node']): string => {
  const counts: string[] = [];
  let up = 0;
  let down = 0;
  Object.values(node.reactions || {}).forEach(value => {
    if (value === '⇧') up += 1;
    if (value === '⇩') down += 1;
  });
  if (up > 0) counts.push(`👍${up}`);
  if (down > 0) counts.push(`👎${down}`);
  const emojis = aggregateEmojiReactions(node.emojiReactions, '', Number.MAX_SAFE_INTEGER).visibleChips;
  counts.push(...emojis.map(item => `${item.emoji}${item.count}`));
  return counts.join(' ');
};

const contentWithoutHeadingMark = (content: string): string => content.replace(/^\s*[#＃]\s*/, '');

const orderedNodes = (nodes: StreamNodeWithIndex[], order: ExportOrder, direction: TimeDirection): StreamNodeWithIndex[] => {
  if (order === 'doc') return nodes;
  return nodes
    .filter(item => item.node.content.trim().length > 0)
    .slice()
    .sort((a, b) => direction === 'asc'
      ? a.node.timestamp - b.node.timestamp
      : b.node.timestamp - a.node.timestamp);
};

const trimDocumentEdges = (items: StreamNodeWithIndex[]): StreamNodeWithIndex[] => {
  if (!EXPORT_DEFAULTS.trimDocumentBlankEdges) return items;
  let start = 0;
  let end = items.length;
  while (start < end && !items[start].node.content.trim()) start += 1;
  while (end > start && !items[end - 1].node.content.trim()) end -= 1;
  return items.slice(start, end);
};

const titleLine = (title: string, format: ExportFormat): string => {
  if (format === 'markdown') return `# ${title}`;
  if (format === 'html') return `<h1>${escapeHtml(title)}</h1>`;
  return title;
};

const urlLine = (roomUrl: string | undefined, format: ExportFormat): string | null => {
  if (!roomUrl) return null;
  if (format === 'html') return `<p>${escapeHtml(roomUrl)}</p>`;
  return roomUrl;
};

const outputTitle = (roomTitle: string, outputAt: number): string =>
  `${roomTitle || 'Chatment'}（${formatDate(outputAt)}にエクスポート）`;

const renderTextLine = (item: StreamNodeWithIndex, options: ExportOptions): string | string[] => {
  const { node } = item;
  if (!node.content.trim()) return [''];
  const isHeading = options.order === 'doc' && node.heading === 'h1';
  const body = isHeading ? contentWithoutHeadingMark(node.content) : node.content;
  const author = options.useRealName ? node.author.realName : node.author.displayName;
  const reaction = options.includeReactions ? reactionText(node) : '';
  const name = options.includeAuthor && author ? (options.order === 'time' ? `${author}: ` : `（${author}）`) : '';
  const time = options.includeTime ? `${formatTime(node.timestamp)} ` : '';
  const plain = options.order === 'time'
    ? `${time}${name}${body}`
    : `${time}${body}${name}`;
  return reaction ? `${plain} ${reaction}` : plain;
};

const renderMarkdown = (items: StreamNodeWithIndex[], title: string, options: ExportOptions, roomUrl?: string): ExportResult => {
  const lines: string[] = [titleLine(title, 'markdown')];
  if (roomUrl) lines.push(roomUrl);
  items.forEach(item => {
    if (!item.node.content.trim()) {
      if (options.order === 'doc') lines.push('');
      return;
    }
    const isHeading = options.order === 'doc' && item.node.heading === 'h1';
    const body = isHeading ? contentWithoutHeadingMark(item.node.content) : item.node.content;
    const indent = options.order === 'doc' ? '  '.repeat(item.node.indent || 0) : '';
    const author = options.includeAuthor
      ? (options.useRealName ? item.node.author.realName : item.node.author.displayName)
      : '';
    const reaction = options.includeReactions ? reactionText(item.node) : '';
    const authorText = author ? (options.order === 'time' ? `**${author}**: ` : `**${author}**`) : '';
    const content = options.order === 'time'
      ? `${authorText}${body}`
      : `${body}${authorText ? `（${authorText}）` : ''}`;
    const line = isHeading ? `## ${body}` : `${indent}${options.order === 'time' ? '' : '- '}${content}`;
    lines.push(reaction ? `${line} ${reaction}` : line);
  });
  return { text: lines.join('\n'), html: '', lines: Math.max(0, lines.length - 1) };
};

const renderCosense = (items: StreamNodeWithIndex[], title: string, options: ExportOptions, roomUrl?: string): ExportResult => {
  const lines: string[] = [titleLine(title, 'cosense')];
  if (roomUrl) lines.push(roomUrl);
  items.forEach(item => {
    if (!item.node.content.trim()) {
      if (options.order === 'doc') lines.push('');
      return;
    }
    const isHeading = options.order === 'doc' && item.node.heading === 'h1';
    const body = (isHeading ? contentWithoutHeadingMark(item.node.content) : item.node.content)
      .replace(/\[/g, '［').replace(/\]/g, '］');
    const indent = options.order === 'doc' ? '  '.repeat(item.node.indent || 0) : '';
    const author = options.includeAuthor ? (options.useRealName ? item.node.author.realName : item.node.author.displayName) : '';
    const reaction = options.includeReactions ? reactionText(item.node) : '';
    const lineBody = options.order === 'time'
      ? `${options.includeTime ? `${formatTime(item.node.timestamp)} ` : ''}${author ? `${author}: ` : ''}${body}`
      : `${options.includeTime ? `${formatTime(item.node.timestamp)} ` : ''}${body}${author ? `（${author}）` : ''}`;
    const line = isHeading ? `[[${body}]]` : `${indent}${lineBody}`;
    lines.push(reaction ? `${line} ${reaction}` : line);
  });
  return { text: lines.join('\n'), html: '', lines: Math.max(0, lines.length - 1) };
};

const renderHtml = (items: StreamNodeWithIndex[], title: string, options: ExportOptions, roomUrl?: string): ExportResult => {
  const plainLines: string[] = [title];
  const htmlLines: string[] = [`<h1>${escapeHtml(title)}</h1>`];
  if (roomUrl) {
    plainLines.push(roomUrl);
    htmlLines.push(urlLine(roomUrl, 'html')!);
  }
  let listLevel = 0;
  const closeLists = () => {
    while (listLevel > 0) {
      htmlLines.push('</ul>');
      listLevel -= 1;
    }
  };
  items.forEach(item => {
    if (!item.node.content.trim()) {
      if (options.order === 'doc') {
        closeLists();
        plainLines.push('');
        htmlLines.push('<p><br></p>');
      }
      return;
    }
    const isHeading = options.order === 'doc' && item.node.heading === 'h1';
    const body = isHeading ? contentWithoutHeadingMark(item.node.content) : item.node.content;
    const author = options.includeAuthor ? (options.useRealName ? item.node.author.realName : item.node.author.displayName) : '';
    const reaction = options.includeReactions ? reactionText(item.node) : '';
    const textLine = renderTextLine(item, options);
    plainLines.push(typeof textLine === 'string' ? textLine : textLine[0]);
    if (isHeading) {
      closeLists();
      htmlLines.push(`<h2>${escapeHtml(body)}</h2>`);
      return;
    }
    const indent = options.order === 'doc' ? (item.node.indent || 0) : 0;
    const prefix = options.order === 'time' && options.includeTime ? `${formatTime(item.node.timestamp)} ` : '';
    const authorHtml = author
      ? options.order === 'time' ? `<strong>${escapeHtml(author)}</strong>: ` : `（<strong>${escapeHtml(author)}</strong>）`
      : '';
    const contentHtml = options.order === 'time'
      ? `${prefix}${authorHtml}${escapeHtml(body)}`
      : `${prefix}${escapeHtml(body)}${authorHtml}`;
    const reactionHtml = reaction ? ` ${escapeHtml(reaction)}` : '';
    if (options.order === 'doc') {
      while (listLevel < indent + 1) {
        htmlLines.push('<ul>');
        listLevel += 1;
      }
      while (listLevel > indent + 1) {
        htmlLines.push('</ul>');
        listLevel -= 1;
      }
      htmlLines.push(`<li>${contentHtml}${reactionHtml}</li>`);
    } else {
      htmlLines.push(`<p>${contentHtml}${reactionHtml}</p>`);
    }
  });
  closeLists();
  return { text: plainLines.join('\n'), html: htmlLines.join('\n'), lines: Math.max(0, plainLines.length - 1) };
};

export function createExport(
  nodes: StreamNodeWithIndex[],
  roomTitle: string,
  outputAt: number,
  options: ExportOptions,
  roomUrl?: string,
): ExportResult {
  const title = outputTitle(roomTitle, outputAt);
  const items = options.order === 'doc'
    ? trimDocumentEdges(orderedNodes(nodes, options.order, options.direction))
    : orderedNodes(nodes, options.order, options.direction);
  if (options.format === 'markdown') return renderMarkdown(items, title, options, roomUrl);
  if (options.format === 'cosense') return renderCosense(items, title, options, roomUrl);
  if (options.format === 'html') return renderHtml(items, title, options, roomUrl);
  const lines = [titleLine(title, 'text')];
  if (roomUrl) lines.push(roomUrl);
  items.forEach(item => {
    const rendered = renderTextLine(item, options);
    if (Array.isArray(rendered)) lines.push(...rendered);
    else {
      const indent = options.order === 'doc' ? '  '.repeat(item.node.indent || 0) : '';
      lines.push(`${indent}${rendered}`);
    }
  });
  return { text: lines.join('\n'), html: '', lines: Math.max(0, lines.length - 1) };
}

export const extensionFor = (format: ExportFormat): string => format === 'cosense' ? 'json' : format === 'markdown' ? 'md' : format;

export function createCosenseJson(results: { title: string; result: ExportResult }[]): string {
  return JSON.stringify({
    pages: results.map(({ title, result }) => {
      const lines = result.text.split('\n');
      lines[0] = title;
      return { title, lines };
    }),
  }, null, 2);
}

export function downloadExports(files: { name: string; content: string }[]): void {
  const archive = zipSync(Object.fromEntries(files.map(file => [file.name, strToU8(file.content)])));
  const blob = new Blob([archive], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'chatment-export.zip';
  anchor.click();
  URL.revokeObjectURL(url);
}
