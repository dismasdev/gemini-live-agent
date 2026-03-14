import { useEffect, useMemo, useState } from "react";

interface IdeaDropAnimationProps {
  ideas: string[];
  trigger: number;
}

interface DropChip {
  id: string;
  text: string;
  left: number;
  delayMs: number;
  durationMs: number;
}

export function IdeaDropAnimation({ ideas, trigger }: IdeaDropAnimationProps) {
  const [chips, setChips] = useState<DropChip[]>([]);

  const visibleIdeas = useMemo(() => ideas.slice(0, 8), [ideas]);

  useEffect(() => {
    if (!trigger || visibleIdeas.length === 0) return;

    const generated: DropChip[] = visibleIdeas.map((text, idx) => {
      const left = 8 + Math.random() * 78;
      const durationMs = 4200 + Math.floor(Math.random() * 1200);
      const delayMs = idx * 280;
      return {
        id: `${trigger}-${idx}-${Math.random().toString(36).slice(2, 8)}`,
        text,
        left,
        delayMs,
        durationMs,
      };
    });

    setChips(generated);

    const maxDuration = Math.max(...generated.map((chip) => chip.delayMs + chip.durationMs));
    const timer = window.setTimeout(() => {
      setChips([]);
    }, maxDuration + 300);

    return () => {
      clearTimeout(timer);
    };
  }, [trigger, visibleIdeas]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden z-40">
      {chips.map((chip) => (
        <div
          key={chip.id}
          className="idea-drop-chip animate-idea-drop"
          style={{
            left: `${chip.left}%`,
            animationDelay: `${chip.delayMs}ms`,
            animationDuration: `${chip.durationMs}ms`,
          }}
        >
          {chip.text}
        </div>
      ))}
    </div>
  );
}
