import { AsteroidsQuiz } from "./AsteroidsQuiz";
import type { KnowledgeQuestion, KnowledgeTest } from "../types/knowledge";

/* Dev-only harness to play-test the Asteroids quiz without auth or Firestore.
 * Route /play-demo (DEV builds only). */

const Q: KnowledgeQuestion[] = [
  {
    id: "q1", orderNum: 1, type: "MC", text: "What must you verify on a new hire's W-4 before they leave?",
    optionA: "It is signed and complete", optionB: "Their favorite color", optionC: "The office thermostat", optionD: "Nothing",
    correctAnswer: "A",
  },
  {
    id: "q2", orderNum: 2, type: "TF", text: "A quarterly review should be scheduled with every active client.",
    optionA: "True", optionB: "False", optionC: null, optionD: null, correctAnswer: "A",
  },
  {
    id: "q3", orderNum: 3, type: "MC", text: "Which is the best first step in a client review?",
    optionA: "Guess the numbers", optionB: "Pull the latest hours + fill data", optionC: "Skip it", optionD: "Ask a competitor",
    correctAnswer: "B",
  },
  {
    id: "q4", orderNum: 4, type: "MC", text: "Who fills out and signs the W-4?",
    optionA: "The recruiter", optionB: "Payroll", optionC: "The employee", optionD: "The client",
    correctAnswer: "C",
  },
  {
    id: "q5", orderNum: 5, type: "TF", text: "You should confirm a candidate's start date with the client before onboarding.",
    optionA: "True", optionB: "False", optionC: null, optionD: null, correctAnswer: "A",
  },
  {
    id: "q6", orderNum: 6, type: "MC", text: "Where do you log a new order from a client?",
    optionA: "A sticky note", optionB: "The ATS / order board", optionC: "Your memory", optionD: "A text message",
    correctAnswer: "B",
  },
  {
    id: "q7", orderNum: 7, type: "MC", text: "What's the priority when a client reports a no-show?",
    optionA: "Ignore it", optionB: "Blame the client", optionC: "Source a replacement fast", optionD: "Wait a week",
    correctAnswer: "C",
  },
  {
    id: "q8", orderNum: 8, type: "TF", text: "Every timecard should be reviewed before it is submitted to payroll.",
    optionA: "True", optionB: "False", optionC: null, optionD: null, correctAnswer: "A",
  },
] as unknown as KnowledgeQuestion[];

const TEST = { id: "demo", name: "Demo Training", maxWrongToPass: 6 } as unknown as KnowledgeTest;

export function AsteroidsDemo() {
  return (
    <div className="min-h-screen bg-kp-bg">
      <AsteroidsQuiz
        quiz={{ questions: Q }}
        test={TEST}
        onComplete={(a) => alert("COMPLETE\n" + JSON.stringify(a, null, 2))}
        onFallback={(a) => alert("FALLBACK\n" + JSON.stringify(a, null, 2))}
        onExit={() => alert("EXIT")}
      />
    </div>
  );
}
