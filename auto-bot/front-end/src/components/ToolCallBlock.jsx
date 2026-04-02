import { useState, useEffect } from 'react';

function statusLabel(status) {
  switch (status) {
    case 'running':
      return 'Running';
    case 'completed':
      return 'Done';
    case 'aborted':
      return 'Aborted';
    case 'error':
      return 'Error';
    default:
      return status || 'Unknown';
  }
}

function statusClass(status) {
  switch (status) {
    case 'running':
      return 'tool-call-block__status--running';
    case 'completed':
      return 'tool-call-block__status--done';
    case 'aborted':
      return 'tool-call-block__status--aborted';
    case 'error':
      return 'tool-call-block__status--error';
    default:
      return '';
  }
}

function isTerminalTool(name) {
  return name === 'execute_terminal_command';
}

/**
 * macOS flat terminal mockup (expanded body for shell execution).
 */
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

function MacTerminalPrompt() {
  return (
    <div className="mac-terminal__prompt font-monospace" aria-hidden>
      <span className="mac-terminal__prompt-user">automicro@AutoMicro-Bot</span>
      <span className="mac-terminal__prompt-path"> ~</span>
      <span className="mac-terminal__prompt-dollar"> $</span>
    </div>
  );
}

/**
 * Cursor-style collapsible row for one tool invocation.
 * Expects shape from App.jsx: { id, toolName, status, startedAt, endedAt, output }
 * or legacy { command, result }.
 */
export default function ToolCallBlock({ toolCall }) {
  const toolName = toolCall.toolName ?? toolCall.command ?? 'tool';
  const terminalUi = isTerminalTool(toolName);
  const status = toolCall.status ?? (toolCall.result === null ? 'running' : toolCall.result === 'Stopped' ? 'aborted' : 'completed');
  const output =
    toolCall.output !== undefined && toolCall.output !== ''
      ? toolCall.output
      : toolCall.result != null && toolCall.result !== 'Stopped'
        ? String(toolCall.result)
        : '';

  const [expanded, setExpanded] = useState(status === 'running');

  useEffect(() => {
    if (status === 'running') setExpanded(true);
  }, [status]);

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
          {terminalUi ? 'Terminal' : toolName}
        </span>
        <span className={`tool-call-block__status ${statusClass(status)}`}>{statusLabel(status)}</span>
      </button>
      {expanded && (
        <div className={`tool-call-block__body${terminalUi ? ' tool-call-block__body--mac-terminal' : ''}`}>
          {terminalUi ? (
            <MacTerminalChrome title="AutoMicro-Bot">
              <MacTerminalPrompt />
              {output ? (
                <pre className="mac-terminal__output font-monospace">{output}</pre>
              ) : status === 'running' ? (
                <div className="mac-terminal__output mac-terminal__output--muted font-monospace">Waiting for output…</div>
              ) : (
                <div className="mac-terminal__output mac-terminal__output--muted font-monospace">No output</div>
              )}
            </MacTerminalChrome>
          ) : (
            <>
              <div className="tool-call-block__cmd font-monospace text-info">$ {toolName}</div>
              {output ? (
                <pre className="tool-call-block__output font-monospace">{output}</pre>
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
