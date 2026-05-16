1. We need to update the feedback mechanism. Provide the new prodigy_framework.txt along with the conversation transcript (already implemented, just need to fix the path).
2. add another layer (a new script) that takes the global response from phase 1, and guide it into the specific group (A or B,C) with another new system prompt. Simply take the response of Agent-1 and transfer it to Agent-2.
3. Integrate it with the current mechanism for every group. Most of the things already implemented, we should just make minimal changes to make that happen.
4. Important NOTE: nothing in the UI should be changed! we are only changing the backend. The UI remains the same.


5. Create a temporary testing script. I have attached two conversations located here:
 conv1.txt, conv2.txt
It will take a conversation, stream it into the two agents we created and your role is to examine the output and make the nesseceery changes based on it.
5. 