1. We have to enter a counter into a table selected table in our DB. initialize it to zero.
2. Create a function in the thank you page, that will increment it (signify how many users completed the whole process)
3. delete the page who allows the user to choose a specific group. We will route the user into a feedback group based on the counter from mission 1.
4. The routing will be simple: mod3(counter) or counter%3. if the value is 0 -> group A. if 2 -> group B. else -> group C.