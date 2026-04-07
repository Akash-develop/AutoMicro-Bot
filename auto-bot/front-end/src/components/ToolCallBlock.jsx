import { useState, useEffect, useMemo } from 'react';

function statusLabel(status) {
  switch (status) {
    case 'running': return 'Running';
    case 'completed': return 'Done';
    case 'aborted': return 'Aborted';
    case 'error': return 'Error';
    default: return status || 'Unknown';
  }
}

function statusClass(status) {
  switch (status) {
    case 'running': return 'tool-call-block__status--running';
    case 'completed': return 'tool-call-block__status--done';
    case 'aborted': return 'tool-call-block__status--aborted';
    case 'error': return 'tool-call-block__status--error';
    default: return '';
  }
}

function isTerminalTool(name) {
  return name === 'execute_terminal_command';
}

const OUTPUT_TRUNCATE_LINES = 25;

function parseStructuredOutput(raw) {
  if (!raw) return { exitCode: null, elapsed: null, body: '' };
  const headerMatch = raw.match(/^\[exit_code:\s*(-?\d+)\](?:\s*\[elapsed:\s*([\d.]+)s\])?\n?([\s\S]*)$/);
  if (!headerMatch) return { exitCode: null, elapsed: null, body: raw };
  return {
    exitCode: parseInt(headerMatch[1], 10),
    elapsed: headerMatch[2] ? parseFloat(headerMatch[2]) : null,
    body: headerMatch[3] || '',
  };
}

function MacTerminalChrome({ children, title = 'Terminal' }) {
  return (
    <div className="mac-terminal">
      <div className="mac-terminal__titlebar">
        <span className="mac-terminal__dots" aria-hidden>
          <span className="mac-terminal__dot mac-terminal__dot--close" />
          <span className="mac-terminal__dot mac-terminal__dot--min" />
          <span className="mac-terminal__dot mac-terminal__dot--max" />
        </span>
        <span className="mac-terminal__title">{title}</span>
      </div>
      <div className="mac-terminal__canvas">{children}</div>
    </div>
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      className="mac-terminal__copy-btn"
      onClick={handleCopy}
      title="Copy output"
    >
      {copied ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
      )}
    </button>
  );
}

export default function ToolCallBlock({ toolCall }) {
  const toolName = toolCall.toolName ?? toolCall.command ?? 'tool';
  const terminalUi = isTerminalTool(toolName);
  const status = toolCall.status ?? (toolCall.result === null ? 'running' : toolCall.result === 'Stopped' ? 'aborted' : 'completed');
  const rawOutput =
    toolCall.output !== undefined && toolCall.output !== ''
      ? toolCall.output
      : toolCall.result != null && toolCall.result !== 'Stopped'
        ? String(toolCall.result)
        : '';

  const shellCommand = toolCall.toolArgs?.command || null;
  const { exitCode, elapsed, body: outputBody } = useMemo(() => parseStructuredOutput(rawOutput), [rawOutput]);

  const [expanded, setExpanded] = useState(status === 'running');
  const [showFull, setShowFull] = useState(false);

  useEffect(() => {
    if (status === 'running') setExpanded(true);
  }, [status]);

  const outputLines = outputBody.split('\n');
  const isTruncated = outputLines.length > OUTPUT_TRUNCATE_LINES && !showFull;
  const displayOutput = isTruncated
    ? outputLines.slice(0, OUTPUT_TRUNCATE_LINES).join('\n') + '\n…'
    : outputBody;

  const exitBadgeOk = exitCode !== null && exitCode === 0;
  const exitBadgeFail = exitCode !== null && exitCode !== 0;

  const headerLabel = terminalUi
    ? (shellCommand ? `$ ${shellCommand}` : 'Terminal')
    : toolName;

  return (
    <div className={`tool-call-block mb-2${terminalUi ? ' tool-call-block--terminal-tool' : ''}`}>
      <button
        type="button"
        className="tool-call-block__header"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <span className="tool-call-block__chevron" aria-hidden>
          {expanded ? '▼' : '▶'}
        </span>
        {status === 'running' ? (
          <span className="tool-call-block__pulse" aria-hidden />
        ) : exitBadgeOk ? (
          <svg className="tool-call-block__icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : exitBadgeFail ? (
          <svg className="tool-call-block__icon tool-call-block__icon--err" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        ) : status === 'completed' ? (
          <svg className="tool-call-block__icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : status === 'aborted' ? (
          <svg className="tool-call-block__icon tool-call-block__icon--warn" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg className="tool-call-block__icon tool-call-block__icon--err" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        )}
        <span className="tool-call-block__name font-monospace">
          {headerLabel}
        </span>
        <span className="tool-call-block__meta-right">
          {elapsed !== null && status !== 'running' && (
            <span className="tool-call-block__elapsed font-monospace">{elapsed}s</span>
          )}
          <span className={`tool-call-block__status ${statusClass(status)}`}>{statusLabel(status)}</span>
        </span>
      </button>
      {expanded && (
        <div className={`tool-call-block__body${terminalUi ? ' tool-call-block__body--mac-terminal' : ''}`}>
          {terminalUi ? (
            <MacTerminalChrome title={shellCommand ? `~ — ${shellCommand}` : 'AutoMicro-Bot'}>
              <div className="mac-terminal__prompt font-monospace" aria-hidden>
                <span className="mac-terminal__prompt-user">automicro</span>
                <span className="mac-terminal__prompt-path"> ~</span>
                <span className="mac-terminal__prompt-dollar"> $</span>
                {shellCommand && <span className="mac-terminal__prompt-cmd"> {shellCommand}</span>}
              </div>
              {outputBody ? (
                <div className="mac-terminal__output-wrap">
                  <CopyButton text={outputBody} />
                  <pre className="mac-terminal__output font-monospace">{displayOutput}</pre>
                  {isTruncated && (
                    <button className="mac-terminal__show-more font-monospace" onClick={() => setShowFull(true)}>
                      Show all {outputLines.length} lines
                    </button>
                  )}
                  {showFull && outputLines.length > OUTPUT_TRUNCATE_LINES && (
                    <button className="mac-terminal__show-more font-monospace" onClick={() => setShowFull(false)}>
                      Collapse
                    </button>
                  )}
                </div>
              ) : status === 'running' ? (
                <div className="mac-terminal__output mac-terminal__output--muted font-monospace">
                  <span className="typing-dot" style={{ width: 4, height: 4 }} />
                  <span className="typing-dot" style={{ width: 4, height: 4 }} />
                  <span className="typing-dot" style={{ width: 4, height: 4 }} />
                </div>
              ) : (
                <div className="mac-terminal__output mac-terminal__output--muted font-monospace">No output</div>
              )}
              {exitCode !== null && status !== 'running' && (
                <div className="mac-terminal__footer font-monospace">
                  <span className={`mac-terminal__exit-badge ${exitCode === 0 ? 'mac-terminal__exit-badge--ok' : 'mac-terminal__exit-badge--fail'}`}>
                    exit {exitCode}
                  </span>
                  {elapsed !== null && (
                    <span className="mac-terminal__elapsed">{elapsed}s</span>
                  )}
                </div>
              )}
            </MacTerminalChrome>
          ) : (
            <>
              <div className="tool-call-block__cmd font-monospace text-info">$ {toolName}</div>
              {rawOutput ? (
                <pre className="tool-call-block__output font-monospace">{rawOutput}</pre>
              ) : status === 'running' ? (
                <div className="tool-call-block__output tool-call-block__output--muted font-monospace">Waiting for output…</div>
              ) : (
                <div className="tool-call-block__output tool-call-block__output--muted font-monospace">No output</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
