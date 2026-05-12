1. We need to delete the extra refrences that being printed under the feedback in the group B page.
# 2. Need to check the caching of the system prompt using Open-AI default multi turn mechanism.
3. Add an immidiate progress bar that will describe the thinking process in the regular layer person conversation.
4. When the feedback is being generated, add a message: "The AI is preparing your feedback. This might take up to 30 seconds"
5. change the title of the 3 groups into 1 unified title: "Feedback"


6. The current way of providing feedback does not encourage dialogue. Therefore, a change was decided: the simulator will not ask an open-ended question ("How do you think you did?") but will start immediately by presenting the first point for improvement, and then ask the student whether he or she would like to expand on this point. If so, the simulator will have a dialogue with the student about this point. If not, the simulator will present the next point for improvement, and again ask after it whether the student would like to expand on it, and so on.


7. So that the simulator does not get "stuck" in an endless dialogue with the student about one of the points in the feedback, each time the simulator presents a comment to the student, a button will appear that says "Present next feedback comment" allowing the student to move to the next comment in the feedback.


8. The order of the reflective questionnaires:
    a) demographic data - part of it is already exists in regular_survey.json. we need to add also a question to select educational institution (list 5 high unviersties in Israel).
    b) explainability questionnaire - explainability_survey.json. need to modify based on the file from Elad
    c) "old" reflective questionnaire (the one that was in the previous simulator) - we need to verify that it's exists.