export interface ConversationLine {
  role: "you" | "coach";
  text: string;
}

export default function ConversationLog({ lines }: { lines: ConversationLine[] }) {
  return (
    <section
      id="talk"
      className="scroll-mt-24 flex flex-col gap-4 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800"
    >
      <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Talk</h2>
      {lines.length === 0 ? (
        <p className="text-zinc-500">After Start, say what you want to practice.</p>
      ) : (
        <ol className="flex max-h-[28rem] flex-col gap-3 overflow-auto pr-1">
          {lines.map((line, index) => (
            <li
              key={index}
              className={
                line.role === "you"
                  ? "ml-6 rounded-2xl bg-zinc-100 px-4 py-3 dark:bg-zinc-900"
                  : "mr-6 rounded-2xl border border-zinc-200 px-4 py-3 dark:border-zinc-800"
              }
            >
              <span className="font-mono text-xs uppercase tracking-wide text-zinc-500">
                {line.role === "you" ? "You" : "Coach"}
              </span>
              <p className="mt-1 leading-6">{line.text}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
