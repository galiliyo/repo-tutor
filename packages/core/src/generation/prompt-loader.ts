// packages/core/src/generation/prompt-loader.ts

import Handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Interface for prompt loading - used for dependency injection and testing
 */
export interface IPromptLoader {
  load(name: string, variables: Record<string, unknown>): string;
}

export class PromptLoader implements IPromptLoader {
  private cache: Map<string, HandlebarsTemplateDelegate> = new Map();
  private promptsDir: string;
  private handlebars = Handlebars.create();

  constructor(promptsDir: string) {
    this.promptsDir = promptsDir;
    this.registerHelpers();
  }

  private registerHelpers(): void {
    this.handlebars.registerHelper('json', (context) => {
      return JSON.stringify(context, null, 2);
    });
  }

  load(name: string, variables: Record<string, unknown>): string {
    let template = this.cache.get(name);

    if (!template) {
      const filePath = path.join(this.promptsDir, `${name}.md`);
      const content = fs.readFileSync(filePath, 'utf-8');
      template = this.handlebars.compile(content);
      this.cache.set(name, template);
    }

    return template(variables);
  }

  clearCache(): void {
    this.cache.clear();
  }
}
