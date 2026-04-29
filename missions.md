1. The simulator responds to what the student said with a generic message that already defined (see server\feedback-group-c-routes.ts row 24), and then gives the student its feedback on the conversation in two stages:
    a) in the first stage, it will give the student the points for improvement, and ask him in a new message "Is there anything you’d like to ask, clarify, or explore further regarding the feedback I provided?". The student can choose to ask for clarification or ask something, and the AI will respond to the student's questions, based on the content of the improvements point it provided AND the conversation transcript. The student can also choose not to ask anything and say that everything is understood. We need to make sure that the AI understand when it's the right time to continue in the conversation.
    b) After that, the simulator will give the student the points to retain, and will ask the student again if he wants an explanation or expansion regarding these points, similarly to phase 1.a

2. Minimum Time Pop-up 
    a) If a student clicks the end conversation button before 3 minutes have passed since the conversation began, the simulator will pop up a pop-up window for the student that will say:
    "Are you sure you want to end the conversation? \n Continuing for at least 5 minutes will help you get more accurate and useful feedback."
    b) We need to add a pause mechanism to the conversation with the layer person, in order for it to happen. In case the user choose to stay, the conversation should continue from the moment it stopped. will need 

3. Change the AI models at the project: NEED TO GENERATE NEW API KEY !!!
I need to ask Ofra to expand the premissions.
    a) for the regular "layer person" simulator phase - change to "GPT-5"
    b) For the feedback phase, where the model receive a heavy system prompt + transcript, define a "thinking" version of GPT.

4. The order of the reflective questionnaires: NEED TO WAIT FOR ELAD TO SEND ME
    a) demographic data - part of it is already exists in regular_survey.json. we need to add also a question to select educational institution (list 5 high unviersties in Israel).
    b) explainability questionnaire - explainability_survey.json. need to modify based on the file from Elad
    c) "old" reflective questionnaire (the one that was in the previous simulator) - we need to verify that it's exists.

5. 
    a) Create an automatic code/ ID that will be presented to the user in the end of all the phases (reached the survey part and click end)! maybe we dont need to genarate new, but provide the same key from the data base, but wee have to ensure the key is unique, and we will later on will know how to connect them.
    b) Generate a small sized PDF that contains the code, and add a download button so the user could click it and download a blank file with the text code inside it.
    c) Add text instructions above the button, "Download this file and upload it into the submition box in your course website"