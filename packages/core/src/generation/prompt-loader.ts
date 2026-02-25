// packages/core/src/generation/prompt-loader.ts

import Handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';

export class PromptLoader {
  private cache: Map<string, HandlebarsTemplateDelegate> = new Map();
  private promptsDir: string;

  constructor(promptsDir: string) {
    this.promptsDir = promptsDir;
    this.registerHelpers();
  }

  private registerHelpers(): void {
    Handlebars.registerHelper('json', (context) => {
      return JSON.stringify(context, null, 2);
    });
  }

  load(name: string, variables: Record<string, unknown>): string {
    let template = this.cache.get(name);

    if (!template) {
      const filePath = path.join(this.promptsDir, `${name}.md`);
      const content = fs.readFileSync(filePath, 'utf-8');
      template = Handlebars.compile(content);
      this.cache.set(name, template);
    }

    return template(variables);
  }

  clearCache(): void {
    this.cache.clear();
  }
}
