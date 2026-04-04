1. create a button in the start page (the welcome page where the user requested to insert an email), that asks for a user name and password (route it smartly)
username: include 4 options ( 'Ayelet', 'Elad', 'Ofra', 'Shahar')
password: DS1122
maybe you should store it in the DB, or define it within the code. its important that it will be secured, and I will send those credentials to the persons I wish that will have access to this section.
a better option would be Firebase Authentication - just let the user enter his own user name and password.

2. goes into a new page where you can read the transcripts nicely (connect it via docs or store the JSON's here, dont know yet)
I think the smarter way is to connect it directly to Google Docs via API key.

3. allow the user to select a conversation he want to test the feedback on.
Thats easier just design a nice UI

3. add a button with an option to start dialogic feedback sessionץ we need to route it directly into the open-ai file that activate the feedback, and also stream the selected transcript into the multi agent mechanism.

4. add an option for the user to fill a survey on how the feedback went