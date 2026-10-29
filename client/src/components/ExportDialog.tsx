import React, { useEffect, useMemo, useState } from 'react';
import type { StreamNodeWithIndex } from '../types';
import {
  createCosenseJson,
  createExport,
  downloadExports,
  EXPORT_DEFAULTS,
  extensionFor,
  type ExportFormat,
  type ExportOrder,
  type ExportSelection,
  type ExportSettings,
  type TimeDirection,
} from '../export/exporter';

interface ExportDialogProps {
  nodes: StreamNodeWithIndex[];
  roomTitle: string;
  roomUrl: string;
  isAdmin?: boolean;
  onClose: () => void;
  onLog?: (details: { type: 'copy' | 'zip'; order: ExportSelection; format: ExportFormat; settings: ExportSettings; lines: number }) => void;
}

const initialSettings = (): ExportSettings => ({
  format: EXPORT_DEFAULTS.format,
  doc: { includeAuthor: true, includeTime: false, includeReactions: false },
  time: { includeAuthor: true, includeTime: true, includeReactions: EXPORT_DEFAULTS.timeReactions },
  direction: EXPORT_DEFAULTS.timeDirection,
});

const orderLabel = (order: ExportOrder, direction?: TimeDirection) =>
  order === 'doc' ? 'ドキュメント順' : `チャット時系列順`;

const safeFileTitle = (title: string) => title.replace(/[\\/:*?"<>|]/g, '_').trim() || 'Chatment';

export const ExportDialog: React.FC<ExportDialogProps> = ({ nodes, roomTitle, roomUrl, isAdmin = false, onClose, onLog }) => {
  const [order, setOrder] = useState<ExportSelection>('doc');
  const [settings, setSettings] = useState<ExportSettings>(initialSettings);
  const [useRealName, setUseRealName] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [fallbackText, setFallbackText] = useState<string | null>(null);
  const [copyLabel, setCopyLabel] = useState('クリップボードにコピー');
  const outputAt = useMemo(() => Date.now(), []);
  useEffect(() => {
    setCopyLabel('クリップボードにコピー');
    setFeedback(null);
  }, [order, settings, useRealName]);
  const current = order === 'both' ? settings.doc : settings[order];
  const currentOptions = { ...current, format: settings.format, order: order === 'both' ? 'doc' : order, direction: settings.direction, useRealName };
  const preview = useMemo(() => {
    if (order !== 'both') return createExport(nodes, roomTitle, outputAt, currentOptions, roomUrl);
    const docResult = createExport(nodes, roomTitle, outputAt, {
      ...settings.doc, format: settings.format, order: 'doc', direction: settings.direction, useRealName,
    }, roomUrl);
    const timeResult = createExport(nodes, roomTitle, outputAt, {
      ...settings.time, format: settings.format, order: 'time', direction: settings.direction, useRealName,
    }, roomUrl);
    return {
      text: `${docResult.text}\n\n${timeResult.text}`,
      html: `${docResult.html}\n${timeResult.html}`,
      lines: docResult.lines + timeResult.lines,
    };
  }, [nodes, roomTitle, roomUrl, outputAt, currentOptions, order, settings, useRealName]);
  const previewParts = useMemo(() => {
    if (order !== 'both') return null;
    return (['doc', 'time'] as ExportOrder[]).map(value => createExport(nodes, roomTitle, outputAt, {
      ...settings[value], format: settings.format, order: value, direction: settings.direction, useRealName,
    }, roomUrl));
  }, [nodes, roomTitle, roomUrl, outputAt, order, settings, useRealName]);

  const updateCurrent = (key: 'format' | 'includeAuthor' | 'includeTime' | 'includeReactions', value: ExportFormat | boolean) => {
    if (key === 'format') {
      setSettings(prev => ({ ...prev, format: value as ExportFormat }));
    } else {
      if (order !== 'both') {
        setSettings(prev => ({ ...prev, [order]: { ...prev[order], [key]: value } }));
      }
    }
  };

  const copy = async (event?: React.MouseEvent<HTMLButtonElement>) => {
    event?.preventDefault();
    event?.stopPropagation();
    setFallbackText(null);
    try {
      const results = (['doc', 'time'] as ExportOrder[])
        .filter(value => order === 'both' || value === order)
        .map(value => createExport(nodes, roomTitle, outputAt, {
          ...settings[value], format: settings.format, order: value, direction: settings.direction, useRealName,
        }, roomUrl));
      const copyText = results.map(result => result.text).join('\n\n');
      const copyHtml = results.map(result => result.html).join('\n');
      if (settings.format === 'html') {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([copyHtml], { type: 'text/html' }),
            'text/plain': new Blob([copyText], { type: 'text/plain' }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(copyText);
      }
      setCopyLabel('コピーしました');
      setFeedback(null);
      onLog?.({ type: 'copy', order, format: settings.format, settings, lines: results.reduce((sum, result) => sum + result.lines, 0) });
    } catch {
      setFallbackText(preview.text);
      setCopyLabel('コピーできませんでした');
      setFeedback('下のテキストを選択してコピーしてください。');
    }
  };

  const download = (event?: React.MouseEvent<HTMLButtonElement>) => {
    event?.preventDefault();
    event?.stopPropagation();
    const selected = order === 'both' ? ['doc', 'time'] as ExportOrder[] : [order as ExportOrder];
    const stamp = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
      .format(outputAt).replace(/[-: ]/g, '');
    const title = roomTitle || 'Chatment';
    const generated = selected.map(selectedOrder => {
      const selectedSettings = settings[selectedOrder];
      const selectedOptions = { ...selectedSettings, format: settings.format, order: selectedOrder, direction: settings.direction, useRealName };
      const result = createExport(nodes, title, outputAt, selectedOptions, roomUrl);
      const pageTitle = `${title}（${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(outputAt)}にエクスポート） ${orderLabel(selectedOrder, settings.direction)}`;
      return { selectedOrder, result, pageTitle };
    });
    const files = generated.map(({ selectedOrder, result, pageTitle }) => ({
      name: `${safeFileTitle(title)}_${stamp}_${selectedOrder}.${extensionFor(settings.format)}`,
      content: settings.format === 'cosense'
        ? createCosenseJson([{ title: pageTitle, result }])
        : settings.format === 'html' ? result.html : result.text,
    }));
    downloadExports(files);
    onLog?.({ type: 'zip', order, format: settings.format, settings, lines: generated.reduce((sum, item) => sum + item.result.lines, 0) });
    setFeedback(null);
  };

  return (
    <div
      className="export-overlay"
      onMouseDown={event => event.stopPropagation()}
      onClick={event => {
        event.stopPropagation();
        onClose();
      }}
    >
      <div
        className="export-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-dialog-title"
        onMouseDown={event => event.stopPropagation()}
        onClick={event => event.stopPropagation()}
      >
        <div className="export-modal__header">
          <h2 className="export-modal__title" id="export-dialog-title">持ち出す</h2>
          <button type="button" className="export-modal__close" onClick={onClose} aria-label="閉じる">×</button>
        </div>
        <fieldset className="export-modal__fieldset"><legend>並び順</legend>
          <label className="export-modal__label"><input type="radio" checked={order === 'doc'} onChange={() => setOrder('doc')} /> ドキュメント順</label>
          <label className="export-modal__label"><input type="radio" checked={order === 'time'} onChange={() => setOrder('time')} /> チャット時系列順</label>
          <label className="export-modal__label"><input type="radio" checked={order === 'both'} onChange={() => setOrder('both')} /> 両方</label>
        </fieldset>
        <fieldset className="export-modal__fieldset"><legend>形式</legend>
          <select className="export-modal__select" value={settings.format} onChange={e => updateCurrent('format', e.target.value as ExportFormat)}>
            <option value="text">プレーンテキスト</option><option value="markdown">Markdown</option><option value="cosense">Cosense記法</option><option value="html">HTML</option>
          </select>
        </fieldset>
        {(order === 'both' ? (['doc', 'time'] as ExportOrder[]) : [order as ExportOrder]).map(value => (
          <fieldset className="export-modal__fieldset" key={value}><legend>付ける情報（{orderLabel(value, settings.direction)}）</legend>
            <label className="export-modal__label"><input type="checkbox" checked={settings[value].includeAuthor} onChange={e => setSettings(prev => ({ ...prev, [value]: { ...prev[value], includeAuthor: e.target.checked } }))} /> 投稿者名</label>
            <label className="export-modal__label"><input type="checkbox" checked={settings[value].includeTime} onChange={e => setSettings(prev => ({ ...prev, [value]: { ...prev[value], includeTime: e.target.checked } }))} /> 時刻</label>
            <label className="export-modal__label"><input type="checkbox" checked={settings[value].includeReactions} onChange={e => setSettings(prev => ({ ...prev, [value]: { ...prev[value], includeReactions: e.target.checked } }))} /> リアクション</label>
            {value === 'time' && <select className="export-modal__select" value={settings.direction} onChange={e => setSettings(prev => ({ ...prev, direction: e.target.value as TimeDirection }))}>
              <option value="asc">昇順（上から1行目が最も古い）</option><option value="desc">降順（下から1行目が最も新しい）</option>
            </select>}
          </fieldset>
        ))}
        {isAdmin && <label className="export-modal__label"><input type="checkbox" checked={useRealName} onChange={e => setUseRealName(e.target.checked)} /> 本名を付ける</label>}
        <div className="export-modal__preview-section">
          <span className="export-modal__preview-title">プレビュー</span>
          {previewParts ? (
            <div className="export-modal__preview-panes">
              <div className="export-modal__preview-pane">
                <span className="export-modal__preview-title">ドキュメント</span>
                <pre className="export-modal__preview">{previewParts[0].text}</pre>
              </div>
              <div className="export-modal__preview-pane">
                <span className="export-modal__preview-title">チャット</span>
                <pre className="export-modal__preview">{previewParts[1].text}</pre>
              </div>
            </div>
          ) : (
            <pre className="export-modal__preview">{preview.text}</pre>
          )}
        </div>
        {fallbackText !== null && <textarea className="export-modal__fallback" readOnly value={fallbackText} onFocus={e => e.currentTarget.select()} rows={6} />}
        {feedback && <p className="export-modal__feedback" role="status">{feedback}</p>}
        <div className="export-modal__actions">
          {order !== 'both' && <button type="button" className={`export-modal__button ${copyLabel === 'コピーしました' ? 'export-modal__button--success' : ''} ${copyLabel === 'コピーできませんでした' ? 'export-modal__button--error' : ''}`} onClick={copy}>{copyLabel}</button>}
          <button type="button" className="export-modal__button export-modal__button--primary" onClick={download}>ZIPでダウンロード</button>
        </div>
      </div>
    </div>
  );
};
