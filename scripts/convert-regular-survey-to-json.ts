import fs from "node:fs";
import path from "node:path";

type SurveyOption = {
  value: number;
  label: string;
  allows_free_text?: boolean;
};

type LikertScale = {
  min: number;
  max: number;
  labels?: Record<string, string>;
};

type SurveyQuestion = {
  id: string;
  text: string;
  type: "single_choice" | "likert" | "text";
  options?: SurveyOption[];
  scale?: LikertScale;
  multiline?: boolean;
};

type SurveyJson = {
  survey_title: string;
  questions: SurveyQuestion[];
  meta?: {
    source_file: string;
    generated_at: string;
  };
};

function isQuestionHeader(line: string): { id: string; text: string } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^([A-Za-z][A-Za-z0-9_]+)\s+(.*)$/);
  if (!match) return null;

  const id = match[1];
  const text = match[2].trim();

  if (!id.startsWith("Survey_") && !id.startsWith("QSurvey_")) {
    return null;
  }

  return { id, text };
}

function parseOptionLine(line: string): SurveyOption | null {
  // Examples:
  // o	Male  (1)
  // o	Prefer to self describe:  (4) ______________
  const match = line.trim().match(/^o\s+(.*?)\s*\((\d+)\)\s*(.*)$/);
  if (!match) return null;

  const label = match[1].trim().replace(/\s+/g, " ");
  const value = Number(match[2]);
  const tail = (match[3] || "").trim();

  const allowsFreeText = /_{3,}/.test(tail) || /:\s*$/.test(label);

  if (!Number.isFinite(value)) return null;

  return {
    value,
    label,
    ...(allowsFreeText ? { allows_free_text: true } : {}),
  };
}

function findLastMatchIndex(text: string, regex: RegExp): RegExpExecArray | null {
  // Requires regex without global side-effects from callers.
  const global = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : `${regex.flags}g`);
  let last: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;
  while ((match = global.exec(text)) !== null) {
    last = match;
  }
  return last;
}

function parseLikertScaleLine(line: string): LikertScale | null {
  // Example:
  // Not helpful at all  1 (1)	2 (2)	3 (3)	4 (4)	Very Helpful  5 (5)
  const m1 = /1\s*\(1\)/.exec(line);
  const m5 = /5\s*\(5\)/.exec(line);
  if (!m1 || !m5) return null;

  const minLabel = line.slice(0, m1.index).trim().replace(/\s+/g, " ");

  const before5 = line.slice(0, m5.index).trimEnd();
  const m4 = findLastMatchIndex(before5, /4\s*\(4\)/);
  const maxLabel = (m4 ? before5.slice(m4.index + m4[0].length) : before5)
    .trim()
    .replace(/\s+/g, " ");

  const labels: Record<string, string> = {};
  if (minLabel) labels["1"] = minLabel;
  if (maxLabel) labels["5"] = maxLabel;

  return {
    min: 1,
    max: 5,
    labels: Object.keys(labels).length ? labels : undefined,
  };
}

function collapseAgeOptions(question: SurveyQuestion): SurveyQuestion {
  if (question.id !== "Survey_Q1_Age") {
    return question;
  }

  return {
    ...question,
    type: "single_choice",
    options: [
      { value: 1, label: "prefer not to say" },
      { value: 2, label: "18-60" },
    ],
  };
}

function parseSurveyTxt(input: string, sourceFile: string): SurveyJson {
  const lines = input.split(/\r?\n/);
  const cleaned = lines
    .map((line) => line.replace(/\u00A0/g, " "))
    .filter((line) => !/^\s*Start of Block:/i.test(line))
    .filter((line) => !/^\s*End of Block:/i.test(line));

  const questions: SurveyQuestion[] = [];

  let i = 0;
  while (i < cleaned.length) {
    const header = isQuestionHeader(cleaned[i]);
    if (!header) {
      i += 1;
      continue;
    }

    const { id, text } = header;
    i += 1;

    const bodyLines: string[] = [];
    while (i < cleaned.length) {
      const maybeNext = isQuestionHeader(cleaned[i]);
      if (maybeNext) break;
      const line = cleaned[i];
      if (line.trim()) {
        bodyLines.push(line);
      }
      i += 1;
    }

    const optionLines = bodyLines
      .map(parseOptionLine)
      .filter((opt): opt is SurveyOption => Boolean(opt));

    const likertLine = bodyLines.find((line) => Boolean(parseLikertScaleLine(line)));
    const likertScale = likertLine ? parseLikertScaleLine(likertLine) : null;

    const hasUnderscores = bodyLines.some((line) => /_{3,}/.test(line));

    let question: SurveyQuestion;
    if (likertScale) {
      question = {
        id,
        text,
        type: "likert",
        scale: likertScale,
      };
    } else if (optionLines.length > 0) {
      question = {
        id,
        text,
        type: "single_choice",
        options: optionLines,
      };
    } else {
      question = {
        id,
        text,
        type: "text",
        multiline: true,
      };
    }

    if (hasUnderscores && question.type === "text") {
      question.multiline = true;
    }

    questions.push(collapseAgeOptions(question));
  }

  return {
    survey_title: "Survey",
    questions,
    meta: {
      source_file: sourceFile,
      generated_at: new Date().toISOString(),
    },
  };
}

function main() {
  const inputArg = process.argv[2] || "regular_survey.txt";
  const outputArg = process.argv[3] || "regular_survey.json";

  const inputPath = path.isAbsolute(inputArg) ? inputArg : path.resolve(process.cwd(), inputArg);
  const outputPath = path.isAbsolute(outputArg) ? outputArg : path.resolve(process.cwd(), outputArg);

  const raw = fs.readFileSync(inputPath, "utf8");
  if (!raw.trim()) {
    console.error(`Input file is empty: ${path.relative(process.cwd(), inputPath)}`);
    process.exitCode = 1;
    return;
  }

  const survey = parseSurveyTxt(raw, path.relative(process.cwd(), inputPath));

  if (survey.questions.length === 0) {
    console.error("Parsed 0 questions. Check the TXT format and encoding.");
    process.exitCode = 1;
    return;
  }

  fs.writeFileSync(outputPath, `${JSON.stringify(survey, null, 2)}\n`, "utf8");

  console.log(`Wrote ${survey.questions.length} questions to ${path.relative(process.cwd(), outputPath)}`);
}

main();
