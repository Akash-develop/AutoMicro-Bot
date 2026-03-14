import React from 'react';

export default function TerminalWindow({ commands }) {
    if (!commands || commands.length === 0) return null;

    return (
        <div className="terminal-window mt-2 rounded bg-dark p-2 text-white font-monospace mb-2 shadow-sm" style={{ fontSize: '0.8rem', border: '1px solid #444', maxHeight: '150px', overflowY: 'auto' }}>
            <div className="terminal-header d-flex align-items-center mb-2 pb-1" style={{ borderBottom: '1px solid #555' }}>
                <span className="me-2 text-secondary">❯</span>
                <span className="text-secondary small">OS Execution Shell</span>
            </div>
            {commands.map((cmd, idx) => (
                <div key={idx} className="mb-2">
                    <div className="terminal-command text-info">
                        $ {cmd.command}
                    </div>
                    {cmd.result && (
                        <div className="terminal-result text-light mt-1" style={{ whiteSpace: 'pre-wrap', opacity: 0.9 }}>
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
