import React from 'react';

export default function TerminalWindow({ commands }) {
    if (!commands || commands.length === 0) return null;

    return (
        <div className="terminal-window mt-2 rounded p-2 mb-2 shadow-sm font-monospace" style={{ fontSize: '0.8rem', border: '1px solid var(--glass-border)', background: 'var(--input-bg)', color: 'var(--text-main)', maxHeight: '150px', overflowY: 'auto' }}>
            <div className="terminal-header d-flex align-items-center mb-2 pb-1" style={{ borderBottom: '1px solid var(--glass-border)' }}>
                <span className="me-2 text-secondary">❯</span>
                <span className="text-secondary small">OS Execution Shell</span>
            </div>
            {commands.map((cmd, idx) => (
                <div key={idx} className="mb-2">
                    <div className="terminal-command text-info">
                        $ {cmd.command}
                    </div>
                    {cmd.result && (
                        <div className="terminal-result mt-1" style={{ whiteSpace: 'pre-wrap', color: 'var(--text-main)', opacity: 0.8 }}>
                            {cmd.result}
                        </div>
                    )}
                    {!cmd.result && (
                        <div className="terminal-result text-secondary mt-1">
                            Running...
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
