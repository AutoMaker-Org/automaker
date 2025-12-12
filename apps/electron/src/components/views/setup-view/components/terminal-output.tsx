interface TerminalOutputProps {
  lines: string[];
}

export function TerminalOutput({ lines }: TerminalOutputProps) {
  return (
    <div className="bg-zinc-900 rounded-lg p-4 font-mono text-sm max-h-48 overflow-y-auto">
      {lines.map((line, index) => (
        <div key={index} className="text-zinc-400">
          <span className="text-green-500">$</span> {line}
        </div>
      ))}
      {lines.length === 0 && (
        <div className="text-zinc-500 italic">Waiting for output...</div>
      )}
    </div>
  );
}
