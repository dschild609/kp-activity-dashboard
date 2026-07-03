import * as XLSX from "xlsx";
import type { AnswerKey } from "../types/knowledge";
import type { NewQuestion } from "./knowledge";

export interface ParsedTestUpload {
  name: string;
  description: string;
  maxWrongToPass: number;
  questions: NewQuestion[];
}

/* Excel format carried over from the original certification app:
 * Sheet "Questions": question_text, question_type (MC|TF), option_a..option_d,
 * correct_answer (A-D). Sheet "Settings": two-column Field | Value rows with
 * test_name, description, max_wrong_to_pass. */
export async function parseTestExcel(file: File): Promise<ParsedTestUpload> {
  const wb = XLSX.read(await file.arrayBuffer());

  const questionsSheet = wb.Sheets["Questions"];
  const settingsSheet = wb.Sheets["Settings"];
  if (!questionsSheet) throw new Error('Missing sheet "Questions".');
  if (!settingsSheet) throw new Error('Missing sheet "Settings".');

  const settingsRows = XLSX.utils.sheet_to_json<[string, string | number]>(settingsSheet, {
    header: 1,
  });
  const settings = new Map<string, string>();
  for (const row of settingsRows) {
    if (row?.[0]) settings.set(String(row[0]).trim().toLowerCase(), String(row[1] ?? "").trim());
  }
  const name = settings.get("test_name") ?? "";
  if (!name) throw new Error('Settings sheet needs a "test_name" row.');
  const maxWrongToPass = Number(settings.get("max_wrong_to_pass") ?? 0);
  if (!Number.isInteger(maxWrongToPass) || maxWrongToPass < 0) {
    throw new Error('"max_wrong_to_pass" must be a non-negative integer.');
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(questionsSheet, {
    defval: "",
  });
  if (rows.length === 0) throw new Error("Questions sheet has no rows.");

  const questions: NewQuestion[] = rows.map((raw, i) => {
    const row = Object.fromEntries(
      Object.entries(raw).map(([k, v]) => [k.trim().toLowerCase(), String(v).trim()])
    );
    const n = i + 2; // 1-based + header row, for error messages
    const text = row["question_text"];
    if (!text) throw new Error(`Row ${n}: question_text is required.`);
    const type = row["question_type"]?.toUpperCase();
    if (type !== "MC" && type !== "TF") throw new Error(`Row ${n}: question_type must be MC or TF.`);
    const optionA = row["option_a"];
    const optionB = row["option_b"];
    if (!optionA || !optionB) throw new Error(`Row ${n}: option_a and option_b are required.`);
    const optionC = row["option_c"] || null;
    const optionD = row["option_d"] || null;
    const correct = row["correct_answer"]?.toUpperCase() as AnswerKey;
    if (!["A", "B", "C", "D"].includes(correct)) {
      throw new Error(`Row ${n}: correct_answer must be A, B, C, or D.`);
    }
    if (type === "TF") {
      if (optionC || optionD) throw new Error(`Row ${n}: TF questions can't have options C/D.`);
      if (correct !== "A" && correct !== "B") throw new Error(`Row ${n}: TF answer must be A or B.`);
    }
    if (correct === "C" && !optionC) throw new Error(`Row ${n}: correct_answer is C but option_c is empty.`);
    if (correct === "D" && !optionD) throw new Error(`Row ${n}: correct_answer is D but option_d is empty.`);
    return { text, type, optionA, optionB, optionC, optionD, correctAnswer: correct };
  });

  return {
    name,
    description: settings.get("description") ?? "",
    maxWrongToPass,
    questions,
  };
}
