I want you to the divide the feedback file into a main feedback file (the root) and three leaves (A,B,C)
before the user press start feedback, he will would need to select 1, 2, or 3. based on his selection we will provide him the feedback.
We have to ask him this question before we start processing the feedback because each feedback requires different system prompt and different mechanism.

1. Group A will be a nice page with the feedback as noted below

2. Group B will be a page with the feedback but include refrences boxed nicely like a quote, from things the user have said.

3. Group C will use our current chat box UI and mechanism of ping pong dialoug.

Group A+B UI should be almost the same, Group C UI is interactive and should be different.

Group A - receive feedback without references to their conversation and without dialogues. For example, the simulator tells them "Note that you used complex language for a layperson, in the next conversation try to speak in simple terms that do not require complicated scientific knowledge. In addition, in the future, try to be sure to ask the interlocutor open questions that ask him to participate in the conversation, and not just respond to the questions he raises." And that's it. Moves them to the next conversation. This is essentially zero explainability.

Group B - receive feedback with references to their conversation, but without dialogues. That is, the simulator gives feedback to students that includes examples from the transcript of the conversation. The examples are supposed to explain to the student what the simulator based its feedback on. For example, the simulator tells the student: "Notice that you used complex language for a layperson, for example when you used the words 'clustering' and 'physical features'. In the next conversation, make sure to use simple, familiar concepts throughout the conversation that even a person without prior scientific knowledge can understand." 

Group C - Dialogic feedback. The format we agreed on is the following:
* Communication between the simulator and the student during the dialogic feedback phase will be written rather than vocal.
* The simulator prepares "on the side" feedback for the student based on Prodigy. The feedback contains two points for retention and two points for improvement.
* The simulator opens the feedback with an introduction to the student:
"Great job completing the first conversation. Before I share my feedback, I'd love to hear your perspective: how do you think it went? What do you feel you did well, and what would you like to improve for the next conversation?"

* The student responds to the simulator’s question, and says how he feels it went.
* The simulator responds to what the student said, and then gives the student his feedback on the conversation (the points he had previously set aside). This feedback will include references and examples from the conversation transcript, as in Group B.
* The simulator opens up the possibility for questions from the student. That is, he asks the student:
"Is there anything you’d like to ask, clarify, or explore further regarding the feedback I provided?"