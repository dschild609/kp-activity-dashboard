import { createTest, type NewQuestion } from "./knowledge";

/* Sample content carried over from the original certification app's seed —
 * handy for local testing before real tests are uploaded. */
const FORKLIFT_QUESTIONS: NewQuestion[] = [
  { text: "You must wear a seatbelt whenever the forklift is in motion.", type: "TF", optionA: "True", optionB: "False", optionC: null, optionD: null, correctAnswer: "A" },
  { text: "What should you do before operating a forklift at the start of a shift?", type: "MC", optionA: "Complete a pre-operation inspection", optionB: "Honk the horn twice", optionC: "Top off the fuel", optionD: "Nothing if it was used yesterday", correctAnswer: "A" },
  { text: "It is acceptable to carry a passenger on the forks if they hold on tightly.", type: "TF", optionA: "True", optionB: "False", optionC: null, optionD: null, correctAnswer: "B" },
  { text: "When traveling with a load, the forks should be:", type: "MC", optionA: "Raised as high as possible", optionB: "Low to the ground and tilted back", optionC: "Level with your waist", optionD: "Tilted forward", correctAnswer: "B" },
  { text: "You may exceed the forklift's rated load capacity if the load looks stable.", type: "TF", optionA: "True", optionB: "False", optionC: null, optionD: null, correctAnswer: "B" },
  { text: "When should you refuel or recharge a forklift?", type: "MC", optionA: "While the engine is running", optionB: "In a designated, ventilated area with the engine off", optionC: "Anywhere convenient", optionD: "Only when completely empty", correctAnswer: "B" },
  { text: "Pedestrians always have the right of way in a warehouse.", type: "TF", optionA: "True", optionB: "False", optionC: null, optionD: null, correctAnswer: "A" },
  { text: "If a load blocks your forward view, you should:", type: "MC", optionA: "Drive in reverse (except going up ramps)", optionB: "Lean out to the side", optionC: "Drive faster to get there sooner", optionD: "Raise the load higher", correctAnswer: "A" },
  { text: "Horseplay on or around a forklift is acceptable during breaks.", type: "TF", optionA: "True", optionB: "False", optionC: null, optionD: null, correctAnswer: "B" },
  { text: "Before backing up, you should:", type: "MC", optionA: "Look in the direction of travel and sound the horn", optionB: "Assume the path is clear", optionC: "Check only your mirrors", optionD: "Close your eyes briefly to focus", correctAnswer: "A" },
  { text: "A forklift with a leaking hydraulic hose can be used for light loads only.", type: "TF", optionA: "True", optionB: "False", optionC: null, optionD: null, correctAnswer: "B" },
  { text: "When parking a forklift, you should:", type: "MC", optionA: "Leave the forks raised", optionB: "Lower forks fully, neutralize controls, set brake, turn off", optionC: "Leave it running for the next operator", optionD: "Park on an incline", correctAnswer: "B" },
  { text: "Turning on a ramp or incline is safe if done slowly.", type: "TF", optionA: "True", optionB: "False", optionC: null, optionD: null, correctAnswer: "B" },
  { text: "How far should you stay from other operating forklifts?", type: "MC", optionA: "About three truck lengths", optionB: "One foot", optionC: "Touching distance", optionD: "No rule applies", correctAnswer: "A" },
  { text: "If the forklift starts to tip over, you should jump clear of it.", type: "TF", optionA: "True", optionB: "False", optionC: null, optionD: null, correctAnswer: "B" },
];

export async function seedForkliftTest(createdBy: string): Promise<string> {
  return createTest({
    name: "Forklift Safety Certification",
    description: "OSHA-based forklift operation and warehouse safety fundamentals.",
    maxWrongToPass: 3,
    tags: ["Safety", "Warehouse"],
    questions: FORKLIFT_QUESTIONS,
    createdBy,
  });
}
