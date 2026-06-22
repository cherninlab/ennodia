import { z } from "zod";

const ListTasksInput = z.object({
  includeEvents: z.boolean().default(false),
  maxEvents: z.number().int().nonnegative().default(25),
});

type Event = {
  at: string;
  message: string;
};

export function selectEvents(events: Event[], rawInput: unknown): Event[] {
  const input = ListTasksInput.parse(rawInput);

  if (!input.includeEvents) {
    return [];
  }

  const maxEvents = input.maxEvents || 25;
  return events.slice(-maxEvents);
}
