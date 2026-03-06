// packages/core/src/core.ts

import * as path from 'path';
import type {
  AnalysisResult,
  Chapter,
  ChapterContent,
  ChapterOutline,
  Question,
  Evaluation,
  SecurityConfig,
  UserContext,
  LLMConfig,
  EvidencePack,
  Answer,
  QuestionContext,
  Logger,
} from './types';
import type { Track } from './types/track';
import { Analyzer } from './analysis';
import {
  LLMClient,
  type ILLMClient,
  type IPromptLoader,
  PromptLoader,
  Planner,
  ChapterWriter,
  EvidenceBuilder,
  BUDGET_FAST,
  BUDGET_FULL,
  QuestionAnswerer,
} from './generation';
import { QuizGenerator, QuizEvaluator } from './quiz';
import { Redactor } from './privacy';

/**
 * Main orchestrator for the Repo Tutor core functionality.
 * Provides a unified API for analyzing repositories, planning chapters,
 * generating content, and creating quizzes.
 */
export class RepoTutorCore {
  private analyzer: Analyzer;
  private llmClient: LLMClient;
  private llmConfig: LLMConfig | null = null;
  private promptLoader: IPromptLoader;
  private planner: Planner | null = null;
  private chapterWriter: ChapterWriter | null = null;
  private evidenceBuilder: EvidenceBuilder;
  private quizGenerator: QuizGenerator | null = null;
  private quizEvaluator: QuizEvaluator | null = null;
  private questionAnswerer: QuestionAnswerer | null = null;
  private redactor: Redactor;

  constructor(promptsDir?: string, private logger?: Logger) {
    // Default to spec/prompts relative to monorepo root
    const specsDir = promptsDir || path.resolve(__dirname, '../../../spec/prompts');

    this.analyzer = new Analyzer();
    this.llmClient = new LLMClient(logger);
    this.promptLoader = new PromptLoader(specsDir);
    this.evidenceBuilder = new EvidenceBuilder();
    this.redactor = new Redactor();
  }

  /**
   * Configure the LLM client with provider and API key.
   * Must be called before any LLM-dependent operations.
   */
  setLLMConfig(config: LLMConfig): void {
    this.llmConfig = config;
    this.llmClient.setConfig(config);

    // Initialize components that depend on the LLM client
    this.planner = new Planner(this.llmClient, this.promptLoader, this.logger);
    this.chapterWriter = new ChapterWriter(this.llmClient, this.promptLoader, this.logger);
    this.quizGenerator = new QuizGenerator(this.llmClient, this.promptLoader, this.logger);
    this.quizEvaluator = new QuizEvaluator(this.llmClient, this.promptLoader, this.logger);
    this.questionAnswerer = new QuestionAnswerer(this.llmClient, this.promptLoader, this.logger);
  }

  /**
   * Validate that the configured API key works.
   * Makes a minimal API call to verify connectivity.
   */
  async validateApiKey(): Promise<boolean> {
    if (!this.llmConfig) {
      return false;
    }

    return this.llmClient.validateApiKey();
  }

  /**
   * Analyze a repository to understand its structure.
   * This is typically the first step in the learning workflow.
   */
  async analyze(repoPath: string, config: SecurityConfig): Promise<AnalysisResult> {
    return this.analyzer.analyze(repoPath, config);
  }

  /**
   * Plan the chapters for learning a codebase.
   * Requires LLM to be configured via setLLMConfig.
   */
  async planChapters(
    analysis: AnalysisResult,
    userContext: UserContext,
    track?: Track,
  ): Promise<Chapter[]> {
    this.ensureLLMConfigured();
    return this.planner!.plan(analysis, userContext, track);
  }

  /**
   * Generate the content for a specific chapter.
   * Automatically builds evidence packs and redacts secrets.
   */
  async generateChapter(
    chapter: Chapter,
    analysis: AnalysisResult,
    userContext: UserContext
  ): Promise<ChapterContent> {
    this.ensureLLMConfigured();

    // Build evidence pack from target files
    const evidence = await this.evidenceBuilder.build(chapter, analysis, BUDGET_FULL);

    // Redact any secrets in the evidence files (privacy is non-negotiable)
    this.redactEvidencePack(evidence);

    return this.chapterWriter!.generate(
      evidence,
      chapter.title,
      chapter.learningObjectives,
      userContext
    );
  }

  /**
   * Generate a quick outline for a chapter (fast pass).
   * Uses a smaller evidence budget for speed.
   */
  async generateChapterOutline(
    chapter: Chapter,
    analysis: AnalysisResult,
    userContext: UserContext,
  ): Promise<ChapterOutline> {
    this.ensureLLMConfigured();

    const evidence = await this.evidenceBuilder.build(chapter, analysis, BUDGET_FAST);
    this.redactEvidencePack(evidence);

    return this.chapterWriter!.generateOutline(
      evidence,
      chapter.title,
      chapter.learningObjectives,
      userContext,
    );
  }

  /**
   * Generate quiz questions for a chapter.
   */
  async generateQuiz(chapter: ChapterContent, existingQuestions?: Question[]): Promise<Question[]> {
    this.ensureLLMConfigured();
    return this.quizGenerator!.generate(chapter, existingQuestions);
  }

  /**
   * Evaluate a user's answer to a quiz question.
   */
  async evaluateAnswer(question: Question, userAnswer: string): Promise<Evaluation> {
    this.ensureLLMConfigured();
    return this.quizEvaluator!.evaluate(question, userAnswer);
  }

  async *streamEvaluationExplanation(
    question: Question,
    userAnswer: string,
    evaluation: Evaluation
  ): AsyncIterable<string> {
    this.ensureLLMConfigured();
    yield* this.quizEvaluator!.streamExplanation(question, userAnswer, evaluation);
  }

  async answerQuestion(question: string, context: QuestionContext): Promise<Answer> {
    this.ensureLLMConfigured();
    return this.questionAnswerer!.answer(question, context);
  }

  /**
   * Redact secrets from content before sending to LLM.
   * Useful for direct content manipulation outside the normal workflow.
   */
  redactContent(content: string): { redacted: string; redactions: string[] } {
    return this.redactor.redact(content);
  }

  /**
   * Check if content contains potential secrets.
   */
  containsSecrets(content: string): boolean {
    return this.redactor.containsSecrets(content);
  }

  /**
   * Get whether LLM is configured.
   */
  get isLLMConfigured(): boolean {
    return this.llmConfig !== null;
  }

  /**
   * Redact secrets from all files in an evidence pack.
   */
  private redactEvidencePack(evidence: EvidencePack): void {
    for (const file of evidence.files) {
      const { redacted, redactions } = this.redactor.redact(file.content);
      file.content = redacted;
      if (redactions.length > 0) {
        evidence.redactionsApplied = [
          ...(evidence.redactionsApplied || []),
          ...redactions.map(r => `${file.path}: ${r}`),
        ];
      }
    }
  }

  /**
   * Ensure LLM is configured before operations that require it.
   */
  private ensureLLMConfigured(): void {
    if (!this.llmConfig) {
      throw new Error('LLM not configured. Call setLLMConfig() first.');
    }
  }
}
