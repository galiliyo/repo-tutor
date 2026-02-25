// packages/core/src/types/quiz.ts

export type QuestionType = 'multiple-choice' | 'true-false' | 'free-text' | 'code-completion';
export type BloomLevel = 'remembering' | 'understanding' | 'applying' | 'analyzing' | 'evaluating';
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface QuestionRubric {
  fullCredit: string;
  partialCredit: string;
  noCredit: string;
}

export interface Question {
  id: string;
  chapterId: string;
  type: QuestionType;
  bloomLevel: BloomLevel;
  difficulty: Difficulty;
  question: string;
  options?: string[];
  correctAnswer: string;
  keyPoints?: string[];
  rubric?: QuestionRubric;
  explanation?: string;
  relatedObjective?: string;
  relatedCode?: {
    file: string;
    lines?: number[];
  };
}

export interface Evaluation {
  questionId: string;
  userAnswer: string;
  isCorrect: boolean;
  score: number;
  keyPointsCovered?: string[];
  keyPointsMissing?: string[];
  misconceptions?: string[];
  feedback: string;
  explanation?: string;
  hints?: string[];
  encouragement?: string;
}

export interface Answer {
  answer: string;
  codeReferences?: Array<{
    file: string;
    startLine?: number;
    endLine?: number;
  }>;
  relatedChapter?: string;
  followUpSuggestion?: string;
}
