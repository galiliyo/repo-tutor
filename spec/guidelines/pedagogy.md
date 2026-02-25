# Pedagogical Guidelines

This document defines the learning principles that inform Repo Tutor's quiz generation, evaluation, and content creation.

## Bloom's Taxonomy Alignment

We align question types with cognitive levels to ensure appropriate assessment depth.

### Cognitive Level Mapping

| Level | Description | Question Types | Example |
|-------|-------------|----------------|---------|
| **Remembering** | Recall facts and basic concepts | multiple-choice, true-false | "Which file contains the entry point?" |
| **Understanding** | Explain ideas or concepts | multiple-choice, free-text | "Why does middleware run before route handlers?" |
| **Applying** | Use information in new situations | free-text, code-completion | "What would this function return for input X?" |
| **Analyzing** | Draw connections among ideas | free-text, code-completion | "Why did the author separate these concerns?" |
| **Evaluating** | Justify a decision or course of action | free-text | "What are the trade-offs of this approach?" |
| **Creating** | Produce new or original work | (Phase 2: practical exercises) | "Add a new endpoint following the existing pattern" |

### Application in Quiz Generation

1. **Align Question Types with Bloom's Levels**: When generating questions, explicitly consider the cognitive level targeted by each learning objective.

2. **Vary Difficulty Levels**: Each quiz MUST include:
   - At least 1 easy question (Remembering/Understanding)
   - At least 1 medium question (Understanding/Applying)
   - At least 1 hard question (Analyzing/Evaluating)

3. **Scaffolding for Free-Text**: Phrase prompts to encourage detailed, explanatory answers. Define key points for automated evaluation.

## Evaluation Principles

### Feedback Quality

1. **Be Specific**: Reference the exact part of the answer that's correct/incorrect
2. **Explain the "Why"**: Don't just state correctness — explain the reasoning
3. **Acknowledge Partial Understanding**: If they got part right, say so first
4. **Address Misconceptions**: Identify the likely misconception, not just that they're wrong
5. **Guide, Don't Lecture**: Use hints to lead toward understanding

### Partial Credit Rubric

| Score | Criteria |
|-------|----------|
| **1.0** | Covers all key points with accurate reasoning |
| **0.7-0.9** | Most key points covered, minor gaps or imprecision |
| **0.4-0.6** | Some key points, but missing important concepts |
| **0.1-0.3** | Shows attempt but fundamental misunderstanding |
| **0.0** | No relevant content or completely wrong |

### Handling Misconceptions

Common patterns to watch for:
- Confusing similar concepts (authentication vs authorization)
- Correct syntax but wrong mental model
- Right answer, wrong reasoning (partial credit but note it)
- Overgeneralization from limited examples

## General Best Practices

### Objective-Driven Assessment

Always ensure that generated questions and evaluations directly map to defined learning objectives, validating the assessment's purpose.

### Contextualized Learning

Utilize all provided context (chapter summaries, code references) to create authentic and relevant assessment scenarios, reducing cognitive load.

### Diagnostic Value

Design questions and feedback to not only assess knowledge but also to diagnose common misconceptions or areas where learners struggle, providing insights for further learning.

### Constructive Feedback Structure

1. Start with what's correct (if anything)
2. Explain what's missing or incorrect
3. Provide the correct understanding
4. Connect to the code
5. Offer encouragement

## References

1. Anderson, L. W., & Krathwohl, D. R. (2001). A Taxonomy for Learning, Teaching, and Assessing
2. Wiggins, G. (1998). Educative Assessment: Designing Assessments to Inform and Improve Student Performance
3. Hattie, J., & Timperley, H. (2007). The Power of Feedback
4. Chi, M. T. H. (2005). Commonsense Conceptions of Emergent Processes
