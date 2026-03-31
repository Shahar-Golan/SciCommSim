# Refactoring Plan: Multi-Agent Dialogic Feedback System

## Objective
Transition the current monolithic feedback system into a dual-agent architecture to prevent "feedback dumps," reduce cognitive load, and encourage interactive, Socratic student reflections based on specific transcript quotes.

---

### Step 1: Overhaul `generateFeedback` (The Rubric Generator)
**Current State:** Returns a single JSON with two massive strings (`strengths`, `improvements`).
**Action Required:**
1. Modify the `feedback_analysis` prompt. Instead of returning a summary string, instruct it to act as an offline analyzer.
2. Change the expected JSON output format to an array of prioritized "Actionable Items" based on the Prodigy framework.
3. **Required JSON Schema:**
   ```json
   {
     "feedback_queue": [
       {
         "priority": 1,
         "type": "improvement",
         "concept": "Jargon Usage",
         "target_quote": "Exact quote from student transcript",
         "issue_description": "Used complex term without defining it."
       }
     ]
   }
   ```
4. **State Management:** Save this `feedback_queue` array to the session state associated with this specific conversation. Maybe here we should create a temporary session state that being deleted immediatly when the feedback ends. we should think of a smart way to create it.

---

### Step 2: Create Agent 1 - The Planner (`evaluateNextMove`)
**Current State:** Does not exist. Logic is currently hardcoded in `getCurrentFeedbackPhase`.
**Action Required:**
1. Create a new strict-JSON function: `async function evaluateNextMove(feedbackMessages, feedbackQueue)`.
2. **Inputs:**
   - The user's latest message (from `feedbackMessages`).
   - The active item from the `feedbackQueue` (index 0).
3. **Task Prompt:** "You are a diagnostic processor. Review the student's latest response against the active rubric item. Did they successfully reflect on or correct the issue? Is the user pushing back/disagreeing?"
4. **Required JSON Output:**
   ```json
   {
     "is_resolved": boolean,
     "user_pushback_detected": boolean,
     "next_strategy": "Ask clarifying question" | "Challenge assumption" | "Move to next item",
     "strategy_notes": "Clinical instructions for the Executor"
   }
   ```
5. **State Update:** If `is_resolved` is true, pop the current item from the `feedbackQueue` in the database.

---

### Step 3: Refactor `generateTeacherResponse` (Agent 2 - The Executor)
**Current State:** Uses static Phase 1-4 logic and injects the massive strengths/improvements strings into the prompt.
**Action Required:**
1. Remove the `getCurrentFeedbackPhase` logic entirely. The flow is now dictated by Agent 1's `is_resolved` boolean.
2. **Inputs:**
   - Agent 1's strategy output (`next_strategy`, `strategy_notes`).
   - The current active item from the `feedbackQueue` (specifically the `target_quote` and `issue_description`).
3. **Update the `teacher_role` Prompt:**
   - Remove the instruction to provide a "comprehensive overview."
   - **New Core Rule:** "You are a Socratic teacher. You MUST only ask ONE question per response. You MUST integrate the provided <target_quote> into your message and ask the user to reflect on it. Do NOT list multiple issues."
   - **Pushback Rule:** "If the strategy notes indicate user pushback, do not automatically apologize. Evaluate their logic. Acknowledge their perspective, but firmly redirect them to the evidence if they are incorrect."
4. **Execution:** Pass the Agent 1 context and the `teacher_role` prompt to `gpt-4o` to generate the final conversational string shown to the student.

---

### Step 4: UI/UX Integration (The "Highlighted Hint" Feature)
**Current State:** Standard chat interface.
**Action Required:**
1. Update the frontend to recognize when the Executor quotes the `target_quote`.
2. (Optional but recommended) Visually highlight this quote in the chat UI, or display a side-by-side view of the original transcript with the `target_quote` highlighted, drawing the student's attention directly to the text they need to reflect on.

### Step 5: Modify current prompts for both agents
1. Implement a "Two-Strike" Socratic Limit (Agent 1 - The Planner)
Socratic questioning is great, but it cannot be an endless loop. The AI needs a strict cutoff where it transitions from asking to telling.

The Fix: Add a socratic_attempts counter to Agent 1's state.

The Logic: * Attempt 1: Ask a guiding question (e.g., "You used the term 'machine learning.' How do you think a layperson interpreted that?").

Attempt 2 (If the student misses the point): Give a heavier hint.

Strike 3 (Direct Feedback): Agent 1 forces the next_strategy to "Direct Instruction." The AI stops asking and says, "The goal here was to avoid jargon. 'Machine learning' is too complex without a definition. Next time, try saying..."

2. Shift the Prompt Focus from "What" to "How" (Agent 2 - The Executor)
The Executor needs strict boundaries so it doesn't ask the user to explain their research. It must focus purely on communication mechanics.

The Fix: Add a rigid constraint to the teacher_role prompt.

Prompt Addition: "Do NOT ask the student to explain the science to you. You are evaluating their communication, not their knowledge. Your questions must focus on the audience's perspective (e.g., 'How could you phrase this more simply?' or 'What is an analogy you could use here?')."

3. Rebalance the Feedback Queue Order (The transcription -> JSON feedback process)

The Fix: Hardcode the queue sorting logic to "Sandwich" the feedback.

The Logic: Force the system to always put a strength at Priority 1, an improvement at Priority 2, etc. Starting the dialogue by highlighting their good engagement builds trust before diving into the jargon critique.

4. Introduce the "Takeaway" Phase
Users need to leave the session knowing exactly what to do next time.

The Fix: Once the queue is empty, trigger a final state where Agent 1 summarizes the session. It should explicitly state: "Here is your main strength to keep doing: X. Here is the main habit to watch out for: Y."

### Step 6: Add time restrictions
since the feedback time is limited to 5 minutes, we cannot dive deep into every sentence the user said. in the queue we have to prioritize the most urgent things, and if there is a remaning time we will modify the rest.