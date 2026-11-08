import type { ChatMessage, CompleteOptions, LlmClient } from '../src/services/llm/llm.client.js';

/** A scripted stand-in for the AI: the writer reply, then a solver that answers by option text. */
export class FakeLlm implements LlmClient {
  readonly model = 'fake-model';
  readonly calls: ChatMessage[][] = [];

  constructor(
    private readonly writerReply: string,
    /** Sentence/first part → the option text (or "No error" / part text) the solver picks. */
    private readonly solverPicks: Record<string, string> = {},
  ) {}

  async complete(messages: ChatMessage[], options: CompleteOptions): Promise<string> {
    this.calls.push(messages);
    if (options.temperature > 0) return this.writerReply;

    const user = messages.find((m) => m.role === 'user')!.content;
    const listJson = user.slice(
      user.indexOf('Questions:\n') + 'Questions:\n'.length,
      user.indexOf('\n\nReturn'),
    );
    const listed = JSON.parse(listJson) as {
      n: number;
      sentence?: string;
      options?: string[];
      parts?: string[];
    }[];
    const answers = listed.map((q) => {
      const key = q.sentence ?? q.parts![0]!;
      const pick = this.solverPicks[key];
      const index = q.options
        ? q.options.indexOf(pick ?? '')
        : pick === 'No error'
          ? 4
          : q.parts!.indexOf(pick ?? '');
      return { n: q.n, answer: index < 0 ? 0 : index };
    });
    return JSON.stringify({ answers });
  }
}
