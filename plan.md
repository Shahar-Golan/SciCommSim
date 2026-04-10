Agentic Architecture
Analyzer Agent (generateFeedback): reads the conversation transcript, extracts a prioritized feedback queue (strength/improvement items with exact student quotes), and returns strengths/improvements text for compatibility.
Planner Agent (evaluateNextMove): inspects the latest student reply against the current active item and decides resolution + next strategy (Challenge assumption, Move to next item, Direct Instruction).
Executor Agent (generateTeacherResponse): produces the coach/teacher reply using the planner decision and active item, with strict behavior rules.

