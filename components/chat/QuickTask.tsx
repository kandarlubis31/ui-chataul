"use client";

import { useState, useEffect, useCallback } from "react";
import { BookOpen, Lightbulb, Code, Zap, ListChecks, Globe, Pencil, Sparkles } from "lucide-react";

export interface QuickTask {
  id: string;
  icon: string;
  label: string;
  prompt: string;
}

interface QuickTaskProps {
  lastAssistantContent?: string;
  onTaskClick: (prompt: string) => void;
}

/** Task definitions that appear after an AI response */
const FOLLOWUP_TASKS: QuickTask[] = [
  { id: "explain-example", icon: "BookOpen", label: "Explain with example", prompt: "Can you explain this with a concrete example?" },
  { id: "alternative", icon: "Lightbulb", label: "Show alternative approach", prompt: "What's an alternative way to approach this?" },
  { id: "code-snippet", icon: "Code", label: "Generate code snippet", prompt: "Can you write a code snippet for this?" },
  { id: "summarize", icon: "Zap", label: "Summarize in brief", prompt: "Can you summarize this in 2–3 sentences?" },
  { id: "pros-cons", icon: "ListChecks", label: "List pros & cons", prompt: "What are the pros and cons of this approach?" },
  { id: "beginner", icon: "Globe", label: "Explain like I'm 5", prompt: "Can you explain this in simple terms, like I'm a beginner?" },
  { id: "next-steps", icon: "Sparkles", label: "Suggest next steps", prompt: "What should I do next based on this?" },
  { id: "rewrite", icon: "Pencil", label: "Rewrite more concisely", prompt: "Can you rewrite this more concisely?" },
];

/** Pick 3 random tasks using Fisher-Yates shuffle */
function pickRandom<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

/** Map icon names to lucide components */
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  BookOpen,
  Lightbulb,
  Code,
  Zap,
  ListChecks,
  Globe,
  Pencil,
  Sparkles,
};

export function QuickTask({ lastAssistantContent, onTaskClick }: QuickTaskProps) {
  const [tasks, setTasks] = useState<QuickTask[]>([]);

  useEffect(() => {
    if (lastAssistantContent) {
      setTasks(pickRandom(FOLLOWUP_TASKS, 3));
    }
  }, [lastAssistantContent]);

  if (!lastAssistantContent) return null;
  if (tasks.length === 0) return null;

  return (
    <div className="mx-auto w-full max-w-chat px-4 pb-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {tasks.map((task) => {
          const Icon = iconMap[task.icon];
          return (
            <button
              key={task.id}
              onClick={() => onTaskClick(task.prompt)}
              className="flex items-center gap-2.5 rounded-lg border border-[var(--color-border-tertiary)] bg-[var(--color-background-secondary)] px-3 py-2.5 text-left text-sm transition-all hover:border-[var(--color-border)] hover:bg-[var(--color-surface)]"
              aria-label={task.label}
            >
              {Icon && <Icon className="h-4 w-4 shrink-0 text-[var(--color-text-secondary)]" />}
              <span className="text-[var(--color-text-secondary)] truncate">{task.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
