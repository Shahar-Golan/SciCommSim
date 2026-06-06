1. We have to enter a counter into a table selected table in our DB. initialize it to zero.
2. Create a function in the thank you page, that will increment it (signify how many users completed the whole process). run this function on the backend API route that processes the final submission
3. delete the page who allows the user to choose a specific group. We will route the user into a feedback group based on the counter from mission 1.
4. The routing will be simple: mod3(counter) or counter%3. if the value is 0 -> group A. if 1 -> group B. 2 -> group 
5. When incrementing the counter in the DB, do not read the value and then write the new value in two separate steps. You must use an atomic operation (like UPDATE table SET counter = counter + 1 RETURNING counter)
6. Add a column in the 'feedback' table - called 'group' that after each feedback session finishes, will insert the group value into it (A, B, C).
7. Important note: user is goint through two feedback sesions in a one run. its super important that he will continue with the SAME group he started with. if the first feedback was B the second should also be B.