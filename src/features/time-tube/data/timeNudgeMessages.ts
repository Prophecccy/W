export interface NudgeMessage {
  title: string;
  body: (ctx: { hours: number; minutes: number; habitCount: number; todoCount: number }) => string;
}

export const MORNING_MESSAGES: NudgeMessage[] = [
  {
    title: "☀ Fresh Start",
    body: ({ todoCount, habitCount }) =>
      `${todoCount} tasks and ${habitCount} habits waiting. You've got all day.`,
  },
  {
    title: "🌅 Good Morning",
    body: () => "Your day is wide open. Tackle the hardest thing first.",
  },
  {
    title: "🔋 Full Tank",
    body: ({ habitCount, todoCount }) =>
      `${habitCount + todoCount} items on deck. Let's go.`,
  },
  {
    title: "📋 Morning Check",
    body: ({ todoCount }) =>
      `${todoCount} todos aren't doing themselves. Start one now.`,
  },
];

export const MIDDAY_MESSAGES: NudgeMessage[] = [
  {
    title: "⏳ Half Day Gone",
    body: ({ habitCount, todoCount }) =>
      `${habitCount} habits and ${todoCount} todos still pending.`,
  },
  {
    title: "🕐 Clock's Ticking",
    body: ({ hours, minutes, todoCount }) =>
      `Only ${hours}h ${minutes}m left and ${todoCount} tasks remain.`,
  },
  {
    title: "⚡ Halfway Mark",
    body: ({ habitCount }) =>
      `You've done well, but ${habitCount} habits need attention.`,
  },
  {
    title: "🔔 Midday Check",
    body: ({ habitCount, todoCount }) =>
      `${habitCount + todoCount} unfinished items. Time to push.`,
  },
  {
    title: "📊 50% Used",
    body: ({ todoCount }) =>
      `Half your day is used up. Prioritize the critical ${todoCount} tasks.`,
  },
];

export const AFTERNOON_MESSAGES: NudgeMessage[] = [
  {
    title: "🔥 Hours Shrinking",
    body: ({ hours, habitCount }) =>
      `Only ${hours} hours left. ${habitCount} habits are counting on you.`,
  },
  {
    title: "⏰ Afternoon Crunch",
    body: ({ todoCount, habitCount }) =>
      `${todoCount} todos and ${habitCount} habits outstanding.`,
  },
  {
    title: "📉 Draining Fast",
    body: () => "Your day is draining fast. Focus on the top 3 items.",
  },
  {
    title: "🎯 Quarter Left",
    body: () => "Less than a quarter of your awake time remains. Act now.",
  },
  {
    title: "⚠ Don't Slip",
    body: ({ habitCount, todoCount }) =>
      `Don't let today slip — ${habitCount + todoCount} things still need doing.`,
  },
];

export const EVENING_MESSAGES: NudgeMessage[] = [
  {
    title: "🌙 Under an Hour",
    body: ({ habitCount }) =>
      `${habitCount} habits need a final push.`,
  },
  {
    title: "⏳ Minutes Counting",
    body: ({ minutes, todoCount }) =>
      `${minutes} minutes until bedtime. Can you knock out ${todoCount} todos?`,
  },
  {
    title: "🔴 Critical",
    body: ({ habitCount, todoCount }) =>
      `${habitCount + todoCount} items still open with minutes to go.`,
  },
  {
    title: "💪 Last Hour",
    body: () => "Last hour sprint — show today who's boss.",
  },
  {
    title: "🏁 Final Stretch",
    body: () => "Final stretch. Every completed item counts.",
  },
];

export const FINAL_MESSAGES: NudgeMessage[] = [
  {
    title: "😤 Time's Up",
    body: ({ minutes }) =>
      `${minutes} minutes. That's it. Go complete something NOW.`,
  },
  {
    title: "🚨 Almost Bedtime",
    body: ({ habitCount }) =>
      `${habitCount} habits staring you down.`,
  },
  {
    title: "⏱ Last 30",
    body: () => "Less than 30 min. Complete what you can. Every bit matters.",
  },
  {
    title: "🌑 Day's Over",
    body: () => "Day's almost over. One more habit? One more todo? Your call.",
  },
  {
    title: "🛏 Bedtime",
    body: () => "Bedtime approaching. Finish strong or accept the outcome.",
  },
];

/**
 * Get the correct message bank for the current phase.
 */
export function getMessagesForPhase(
  phase: "morning" | "midday" | "afternoon" | "evening" | "final"
): NudgeMessage[] {
  switch (phase) {
    case "morning": return MORNING_MESSAGES;
    case "midday": return MIDDAY_MESSAGES;
    case "afternoon": return AFTERNOON_MESSAGES;
    case "evening": return EVENING_MESSAGES;
    case "final": return FINAL_MESSAGES;
  }
}

/**
 * Pick a random message, avoiding recent repeats.
 */
export function pickMessage(
  messages: NudgeMessage[],
  recentIndices: number[]
): { message: NudgeMessage; index: number } {
  const available = messages
    .map((_, i) => i)
    .filter((i) => !recentIndices.includes(i));

  const pool = available.length > 0 ? available : messages.map((_, i) => i);
  const idx = pool[Math.floor(Math.random() * pool.length)];
  return { message: messages[idx], index: idx };
}
