export interface ConversationLine {
  role: "you" | "coach";
  text: string;
}

export default function ConversationLog({ lines }: { lines: ConversationLine[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Conversation</h2>
      {lines.length === 0 ? (
        <p className="text-zinc-500">Say what you want to practice. For example, C to G at 60.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {lines.map((line, index) => (
            <li key={index} className="text-sm leading-6">
              <span className="font-mono text-xs uppercase tracking-wide text-zinc-500">
                {line.role === "you" ? "You" : "Coach"}
              </span>
              <p>{line.text}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
