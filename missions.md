1. create a button in the start page (the welcome page where the user requested to insert an email), that asks for a user name and password (route it smartly)
username: include 4 options ( 'Ayelet', 'Elad', 'Ofra', 'Shahar')
password: DS1122
maybe you should store it in the DB, or define it within the code. its important that it will be secured, and I will send those credentials to the persons I wish that will have access to this section.
a better option would be Firebase Authentication - just let the user enter his own user name and password. DONE!

2. goes into a new page where you can read the transcripts nicely (connect it via docs or store the JSON's here, dont know yet)
I think the smarter way is to connect it directly to Google Docs via API key.

code helper:
const { google } = require('googleapis');

// Authenticate with your new JSON file
const auth = new google.auth.GoogleAuth({
  keyFile: './google-credentials.json', // Must match the exact filename
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});

const drive = google.drive({ version: 'v3', auth });
const FOLDER_ID = 'YOUR_FOLDER_ID_HERE'; // Don't forget to paste the folder ID from the URL!

// ... (keep the two app.get routes from the previous message here)


FOLDER_ID=https://drive.google.com/drive/folders/1Ed-P__AoqI5ZK3l2WR10Bwa1ljULaXw0

dont forget to add the credintial to .gitignore

3. allow the user to select a conversation he want to test the feedback on.
Thats easier just design a nice UI

4. add a button with an option to start dialogic feedback sessionץ we need to route it directly into the open-ai file that activate the feedback, and also stream the selected transcript into the multi agent mechanism.
Note: You have to run a check to verify to match the regular JSON data that the agent regulary receive. 
files:
feedback.tsx
feedback-dialogue.tsx

DONE! 
- Added POST /api/test-feedback/generate-feedback endpoint that:
  * Parses transcript content into Message array format
  * Converts speaker names (Ayelet -> 'ai', student -> 'student')
  * Calls generateFeedback() from openai-feedback.ts
  * Returns feedback_queue, strengths, and improvements
- Added "Start Feedback" button to test-feedback.tsx that:
  * Calls the new endpoint with transcript content
  * Displays feedback results in structured cards
  * Shows strengths, improvements, and detailed feedback queue items
  * Displays message analysis count


5. I have modified the folders structure in Drive.
view the new folder here:
https://drive.google.com/drive/folders/1gW14om5G13M9dlXbUbTrI9XU_UoRaQtH
modify the script scripts\validate-drive-structure.ts to understand how the files look like now.
after that, modify the UI so the user could access those files effictively (similarly to what we current have, remeber to BOLD the speakers' label).
Then, add an option to start the dialogic feedback, only if the user reads a 'conv1' or 'conv2' file. 
for example:
if the user reads 'conv1' and press the button, we wilkl stream conv1 transcript into the agent and start the feedback

DONE!
- Updated scripts/validate-drive-structure.ts:
  * Default folder switched to 1gW14om5G13M9dlXbUbTrI9XU_UoRaQtH
  * Added conv1/conv2 detection and summary counts
  * Prints eligibility guidance for dialogic feedback
- Updated server/routes.ts:
  * Transcript list now carries conversationTag and isDialogicEligible
  * Grouping supports nested folder paths more effectively
  * /api/test-feedback/generate-feedback now requires transcriptName
  * Dialogic feedback is enforced only for conv1/conv2 files
- Updated client/src/pages/test-feedback.tsx:
  * Added conv1/conv2 badges in transcript list
  * Kept speaker labels bold in transcript rendering
  * "Start Dialogic Feedback" button is enabled only for eligible files
  * Added clear warning message for non-eligible files


6. add an option for the user to fill a survey on how the feedback went

NEXT: Build survey page that collects feedback on:
- Helpfulness of feedback
- Clarity of guidance
- Overall experience
- Optional comments

drive-reader@scicommsim.iam.gserviceaccount.com