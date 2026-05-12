export type SurveyQuestion =
  | {
      id: string;
      type: "number";
      text: string;
      placeholder?: string;
      required?: boolean;
    }
  | {
      id: string;
      type: "single_choice";
      text: string;
      options: string[];
      required?: boolean;
      freeTextOptionPrefixes?: string[];
    }
  | {
      id: string;
      type: "likert";
      text: string;
      required?: boolean;
      leftLabel: string;
      rightLabel: string;
    }
  | {
      id: string;
      type: "text";
      text: string;
      required?: boolean;
      rows?: number;
      placeholder?: string;
    };

export type SurveySection = {
  title: string;
  instructions?: string;
  questions: SurveyQuestion[];
};

export const SURVEY_TITLE = "Post Practice Surveys";

export const SURVEY_SECTIONS_ALL: SurveySection[] = [
  {
    title: "Explainability",
    instructions: "Please indicate your level of agreement with the following statements:",
    questions: [
      {
        id: "clarity",
        type: "likert",
        text: "Clarity: The feedback clearly explained my communication during the conversation.",
        leftLabel: "Strongly disagree",
        rightLabel: "Strongly agree",
        required: true,
      },
      {
        id: "understandability",
        type: "likert",
        text: "Understandability: From the feedback, I understand how I communicated during the conversation.",
        leftLabel: "Strongly disagree",
        rightLabel: "Strongly agree",
        required: true,
      },
      {
        id: "completeness",
        type: "likert",
        text: "Completeness: The feedback addressed all the important aspects of my communication.",
        leftLabel: "Strongly disagree",
        rightLabel: "Strongly agree",
        required: true,
      },
      {
        id: "satisfaction",
        type: "likert",
        text: "Satisfaction: The feedback was satisfying in capturing my communication during the conversation.",
        leftLabel: "Strongly disagree",
        rightLabel: "Strongly agree",
        required: true,
      },
      {
        id: "usefulness",
        type: "likert",
        text: "Usefulness: The feedback was useful for improving my communication skills.",
        leftLabel: "Strongly disagree",
        rightLabel: "Strongly agree",
        required: true,
      },
      {
        id: "accuracy",
        type: "likert",
        text: "Accuracy: The feedback accurately reflected my communication during the conversation.",
        leftLabel: "Strongly disagree",
        rightLabel: "Strongly agree",
        required: true,
      },
      {
        id: "insight",
        type: "likert",
        text: "Insight: The feedback provided insights about my communication that I was not aware of during the conversation.",
        leftLabel: "Strongly disagree",
        rightLabel: "Strongly agree",
        required: true,
      },
      {
        id: "explainability_justification",
        type: "likert",
        text: "Explainability (Justification): The feedback helped me understand why the specific comments in the feedback were given to me.",
        leftLabel: "Strongly disagree",
        rightLabel: "Strongly agree",
        required: true,
      },
      {
        id: "explainability_depth",
        type: "likert",
        text: "Explainability (Depth): The feedback provided sufficient explanation for its evaluations.",
        leftLabel: "Strongly disagree",
        rightLabel: "Strongly agree",
        required: true,
      },
      {
        id: "preference",
        type: "likert",
        text: "Preference: I would prefer receiving feedback in this format compared to other forms of feedback (e.g., brief comments, grades only, or no feedback).",
        leftLabel: "Strongly disagree",
        rightLabel: "Strongly agree",
        required: true,
      },
    ],
  },
  {
    title: "User Experience",
    questions: [
      {
        id: "helpfulness",
        type: "likert",
        text: "To what extent did you find the practice helpful for improving your communication skills?",
        leftLabel: "Not helpful at all",
        rightLabel: "Very Helpful",
        required: true,
      },
      {
        id: "recommend",
        type: "likert",
        text: "Please indicate your level of agreement with the following statement: “I would recommend this practice to other students who wish to improve their science communication skills”.",
        leftLabel: "Strongly disagree",
        rightLabel: "Strongly agree",
        required: true,
      },
      {
        id: "changed",
        type: "text",
        text: "In the second conversation, did you change the way you communicated with the simulator?",
        rows: 3,
        placeholder: "Your answer",
      },
      {
        id: "changed_why",
        type: "text",
        text: "If yes, what did you change and why?",
        rows: 4,
        placeholder: "Your answer",
      },
      {
        id: "learned",
        type: "text",
        text: "Did you learn something new during this practice? If so, what did you learn?",
        rows: 4,
        placeholder: "Your answer",
      },
      {
        id: "comments",
        type: "text",
        text: "We would love to hear any comments or suggestions you have regarding this tool:",
        rows: 5,
        placeholder: "Your comments",
      },
    ],
  },
  {
    title: "Demographics",
    questions: [
      {
        id: "age",
        type: "number",
        text: "What is your age?",
        placeholder: "Enter your age",
        required: true,
      },
      {
        id: "gender",
        type: "single_choice",
        text: "What is your gender?",
        options: [
          "Male",
          "Female",
          "Non-binary / third gender",
          "Prefer to self describe:",
          "prefer not to say",
        ],
        required: true,
        freeTextOptionPrefixes: ["Prefer to self describe"],
      },
      {
        id: "degree",
        type: "single_choice",
        text: "What degree program are you currently enrolled in?",
        options: ["BA / BSc", "MA / MSc", "PhD / MD", "Other:"],
        required: true,
        freeTextOptionPrefixes: ["Other"],
      },
      {
        id: "field",
        type: "single_choice",
        text: "What is your main field of study?",
        options: [
          "Life Sciences (e.g., Biology, Biochemistry, Biotechnology)",
          "Physical Sciences (e.g., Physics, Chemistry, Earth Sciences)",
          "Engineering or Computer Science",
          "Medicine or Health Sciences",
          "Social Sciences (e.g., Psychology, Sociology, Education, Economics)",
          "Humanities or Arts",
          "Other (please specify):",
        ],
        required: true,
        freeTextOptionPrefixes: ["Other"],
      },
    ],
  },
];

export function optionNeedsFreeText(option: string, prefixes: string[] | undefined) {
  if (!prefixes?.length) return false;
  const normalized = option.trim().toLowerCase();
  return prefixes.some((p) => normalized.startsWith(p.toLowerCase()));
}

export function buildSurveyTextResponse(sections: SurveySection[], responses: Record<string, string>) {
  const lines: string[] = [];
  lines.push(SURVEY_TITLE);
  lines.push("");

  for (const section of sections) {
    lines.push(section.title);
    if (section.instructions) lines.push(section.instructions);

    for (const q of section.questions) {
      const answer = responses[q.id] ?? "";
      const free = responses[`${q.id}__free`] ?? "";
      const combined = free ? `${answer} | ${free}` : answer;
      lines.push(`- ${q.text}`);
      lines.push(`  Answer: ${combined}`);
    }

    lines.push("");
  }

  return lines.join("\n").trim();
}

export function getRequiredQuestionIds(sections: SurveySection[]) {
  const requiredIds: string[] = [];
  for (const section of sections) {
    for (const q of section.questions) {
      if (q.required) requiredIds.push(q.id);
    }
  }
  return requiredIds;
}

export function findFirstMissingRequiredAnswer(sections: SurveySection[], responses: Record<string, string>) {
  for (const section of sections) {
    for (const q of section.questions) {
      if (q.required && !responses[q.id]?.trim()) return q.id;

      if (q.type === "single_choice") {
        const selected = responses[q.id] ?? "";
        const needsFree = selected ? optionNeedsFreeText(selected, q.freeTextOptionPrefixes) : false;
        if (needsFree && !responses[`${q.id}__free`]?.trim()) return `${q.id}__free`;
      }
    }
  }

  return null;
}
