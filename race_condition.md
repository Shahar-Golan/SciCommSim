1. We have to enter a counter into a table selected table in our DB. initialize it to zero.
2. Create a function in the thank you page, that will increment it (signify how many users completed the whole process). run this function on the backend API route that processes the final submission
3. delete the page who allows the user to choose a specific group. We will route the user into a feedback group based on the counter from mission 1.
4. The routing will be simple: mod3(counter) or counter%3. if the value is 0 -> group A. if 1 -> group B. 2 -> group 
5. When incrementing the counter in the DB, do not read the value and then write the new value in two separate steps. You must use an atomic operation (like UPDATE table SET counter = counter + 1 RETURNING counter)
6. Add a column in the 'feedback' table - called 'group' that after each feedback session finishes, will insert the group value into it (A, B, C).
7. Important note: user is goint through two feedback sesions in a one run. its super important that he will continue with the SAME group he started with. if the first feedback was B the second should also be B.


8. remove questions in the Explainability Questionnaire: remove the 3 questions of Understanding, Satisfaction, Explainability (Depth) from the Explainability Questionnaire.
refrence: C:\Users\golan\VisualStudioProjects\SciCommSim\client\src\pages\survey-explainability.tsx

9. Adding a question about educational institution: In the demographic questionnaire, ask which academic institution they study at - Technion, Tel Aviv University, or other (and then they can write where).
refrence: C:\Users\golan\VisualStudioProjects\SciCommSim\client\src\pages\survey-demographics.tsx

10. Pop-up in Group C: In the feedback in Group C, after it gives the point for improvement, allow me to click complete feedback without giving me the pop-up.
refrence: C:\Users\golan\VisualStudioProjects\SciCommSim\client\src\pages\feedback-group-c.tsx


11. "Enter" (/n) between points for improvement in Group B's feedback: In the points for improvement in Group B's feedback, the "Enter" is still missing between the two points for improvement
refrence: C:\Users\golan\VisualStudioProjects\SciCommSim\client\src\pages\feedback-group-b.tsx