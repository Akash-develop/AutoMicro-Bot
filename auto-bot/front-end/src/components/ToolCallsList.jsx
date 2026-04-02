import ToolCallBlock from './ToolCallBlock.jsx';

/**
 * Renders all tool calls for an assistant message (Cursor-style blocks).
 */
export default function ToolCallsList({ commands }) {
  if (!commands || commands.length === 0) return null;

  return (
    <div className="tool-calls-list mb-2">
      {commands.map((cmd, idx) => (
        <ToolCallBlock key={cmd.id ?? idx} toolCall={cmd} />
      ))}
    </div>
  );
}
