1. We need to update the feedback mechanism. Provide the new prodigy_framework.txt along with the conversation transcript (already implemented, just need to fix the path).
2. add another layer (a new script) that takes the global response from phase 1, and guide it into the specific group (A or B,C) with another new system prompt. Simply take the response of Agent-1 and transfer it to Agent-2.
3. Integrate it with the current mechanism for every group. Most of the things already implemented, we should just make minimal changes to make that happen.
4. Important NOTE: nothing in the UI should be changed! we are only changing the backend. The UI remains the same.


5. Modify the system prompt for groups A, B+C based on the new prompts I have uploded.


GROUP A:
THE NEXT BULLET, IN GREEN FONT, IS ONLY FOR GROUP ‘A’ (CONTROL GROUP – ‘ZERO EXPLAINABILITY’) IN THE EXPERIMENT:
Structure of Feedback Points:
When presenting the feedback, do NOT include quotes, references, or paraphrases from the conversation transcript. Provide only the feedback points themselves, in a concise form.
Output format:
•	Areas for Improvement (up to 3 points): Short, actionable recommendations. 
•	Strength (1 point): One concise statement describing what was done well. 
Guidelines:
•	Each point should be brief (1–2 sentences maximum). 
•	Focus on clear, actionable advice, without justification or detailed explanation. 
•	Do not include evidence, examples from the conversation, or suggested phrasing. 
•	Avoid repetition – each point should address a distinct aspect of dialogic communication. 
•	Maintain a neutral, professional tone (avoid praise-heavy or evaluative language). 
•	Base all feedback implicitly on Prodigy features, but do not explicitly elaborate on them. 
Here is an example of what such feedback might look like:
Areas for improvement:
1.	Reduce the use of jargon and use simpler, more accessible language. 
2.	Invite your conversation partner to share their thoughts more actively. 
3.	Show more empathy when responding to concerns raised by the conversation partner. 
Strength: You clearly explained the importance and real-world relevance of your research.


GROUP B+C:

THE NEXT BULLET, IN RED FONT, IS ONLY FOR GROUPS ‘B’ AND ‘C’ IN THE EXPERIMENT:

Structure of feedback points:
For strengths:
•	Briefly describe what was done well. 
•	Reference a concrete example (quote or paraphrase). 
•	Explain why this aligns with Prodigy. 

For areas for improvement:
Each point should include:
1.	Evidence (quote from the conversation) 
2.	Diagnosis (what was suboptimal or missing, linked to Prodigy) 
3.	Actionable suggestion (what to do instead) 
4.	Optional example phrasing 

Use the following as a flexible guideline (not a rigid template):
•	If something was done suboptimally:
“You said: ‘___’. This may be problematic because ___ (Prodigy-based explanation). A more effective approach would be to _____. For example: ‘’_______.”
Here is an example of this type of feedback:
For instance, if I used too much jargon, you could provide me with the following feedback: “When presenting your research, you said: ‘I explore the use of LLMs for communication training.’ This could be problematic, since a lot of people are not familiar with the term ‘LLMs’, and that could be confusing for them. Instead of ‘LLMs’ you could say something in simpler words that a layperson would understand, like: ‘Artificial Intelligence’ or ‘computer programs’. “
•	If something was missing (missed opportunity):
“When you said: ‘___’, this could have been an opportunity to _______. You could have added something like: ‘’_________.”
Here is an example of this type of feedback:
For instance, if I didn’t ask even a single open question during the entire conversation, you could provide me with the following feedback: “When talking about the data collection, you said: ‘We’re really struggling with getting participants to sign up for the experiment.’ This could be a great opportunity to ask your conversation partner for their ideas, making them more active in the conversation. You could ask your conversation partner something like: ‘Do you have any ideas or suggestions on how to raise participants’ motivation to sign up for the experiment?’ “.

Additional guidelines:
•	Be specific and evidence-based – avoid vague or generic feedback. 
•	Avoid excessive praise or encouragement – focus on constructive, professional feedback. 
•	Do not repeat similar points – each point should address a distinct issue. 
•	Use clear, concise language suitable for learning. 
•	Prioritize actionable insights over exhaustive coverage. 




6. Create a temporary testing script. I have attached two conversations located here:
 conv1.txt, conv2.txt
It will take a conversation, stream it into the two agents we created and your role is to examine the output and make the nesseceery changes based on it.


7. fix the UI in Group B to rectangle the exact quotes from the conversation.
8. Force the feedback to produce exactly 3 points to improve, and 2 points of strenghts.
9. In group B+C force the quotes from the conversation in b
10. Verify that the context in group C includes the former back and forth conversation.
11. Verify that in Group C, the agent that respond ins wearing a hat of a sceince communication teacher and not a global LLM.