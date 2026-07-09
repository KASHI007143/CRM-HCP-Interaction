# AI-First CRM: HCP Interaction Log Suite

An intelligent, hands-free relationship management dashboard designed for medical sales representatives and MSLs (Medical Science Liaisons). This application utilizes a server-side agentic state graph (inspired by LangGraph architectures) to automate form-filling completely from natural voice dictation or typed conversations.

It validates, maps, and persists clinical interaction metrics directly into a local **MySQL database**, presenting saved histories in real-time.

---

## 🏗️ Architectural Flow

```
                                  +------------------------------------+
                                  |    Voice Dictation / Chat Input    |
                                  +------------------+-----------------+
                                                     |
                                                     v
                                  +------------------+-----------------+
                                  |         Express API Server         |
                                  +------------------+-----------------+
                                                     |
                                                     v
                                  +------------------+-----------------+
                                  |       Agent State Graph            |
                                  |  (Evaluates nodes & LLM Tools)     |
                                  +---------+----------------+---------+
                                            |                |
                                            v                v
                     +----------------------+-----+    +-----+----------------------+
                     | MySQL Database (Persistent)|    | Redux Store (Reactive State)|
                     |  - Stores submitted logs   |    |  - Handles active form UI  |
                     +----------------------------+    +----------------------------+
```

---

## 🔍 In-Depth Guide: 5 Core LangGraph Tools

Our server-side orchestrator evaluates state transitions using a state-graph loop. The message is first examined by the `router_evaluator` node, which forwards it to the appropriate tool node. Here is a detailed breakdown of how the 5 main tools operate:

### 1. `create_interaction` (Form Generation Tool)
*   **What it does:** Extracts full clinical metrics from unstructured text or a transcribed voice note to initialize the CRM form state.
*   **How it works:**
    1.  Uses a zero-shot prompt with an anchor date (`2026-07-08`) to resolve relative timelines like "today" or "yesterday".
    2.  Extracts and standardizes values for `hcpName`, `interactionType`, `date`, `time`, `attendees`, `topicsDiscussed`, `sentiment`, `outcomes`, and `followUpActions`.
    3.  Pipes the extracted data back into the Redux state, resetting any previous draft.
*   **Demo Example:**
    *   *Input:* `"Today I met with Dr. Alice Sharma at the Oncology clinic to discuss OncoBoost Clinical Trial Phase III. The meeting went well and we scheduled a follow-up next Tuesday."`
    *   *Resulting State:*
        ```json
        {
          "hcpName": "Dr. Alice Sharma (Oncology clinic)",
          "interactionType": "Meeting",
          "date": "2026-07-08",
          "time": "10:30",
          "topicsDiscussed": "OncoBoost Clinical Trial Phase III evaluation",
          "sentiment": "Positive"
        }
        ```

### 2. `update_interaction` (Dynamic Field Editor Tool)
*   **What it does:** Allows the representative to make corrections or edit individual form fields using conversational commands without overwriting the rest of the form.
*   **How it works:**
    1.  Takes the existing form state and the user's edit request.
    2.  The LLM generates a JSON object containing **only** the `updatedFields` that need to be changed.
    3.  Performs a shallow merge (`{ ...state.formState, ...updatedFields }`) on the server before updating Redux.
*   **Demo Example:**
    *   *Input:* `"Sorry, change the doctor name to Dr. Alice Smith and set the sentiment to Neutral."`
    *   *Resulting State:* Updates `hcpName` to `"Dr. Alice Smith"` and `sentiment` to `"Neutral"`, leaving all other fields (dates, topics, samples) unchanged.

### 3. `add_drug_sample` (Medication Starter Kit Logger Tool)
*   **What it does:** Records medication/product samples distributed to the clinic, ensuring they are stored safely and cleanly without crashing the UI.
*   **How it works:**
    1.  Identifies drug names, dosages, and quantities from the input (e.g., "3 boxes of OncoBoost 50mg").
    2.  **Robust Sanitization:** The server automatically intercepts the LLM response. If the LLM generates a structured object like `{"name": "OncoBoost", "quantity": 3}` instead of a string, a helper function converts it to `"OncoBoost x 3"` before updating the array.
    3.  Appends the sanitized strings into the `samplesDistributed` array.
*   **Demo Example:**
    *   *Input:* `"Please add 3 packs of OncoBoost 50mg and 2 packages of Prodo-X."`
    *   *Resulting State:*
        ```json
        {
          "samplesDistributed": [
            "OncoBoost 50mg x 3",
            "Prodo-X x 2"
          ]
        }
        ```

### 4. `add_material` (Literature & Pamphlet Logger Tool)
*   **What it does:** Extracts clinical literature, flyers, booklets, or trials mentioned and adds them to the shared materials record list.
*   **How it works:**
    1.  Parses the user prompt to find clinical literature names.
    2.  Extracts them into a list of strings (`materialsToAdd`).
    3.  Merges the list with existing items in `materialsShared` using a `Set` to prevent duplicate logs.
*   **Demo Example:**
    *   *Input:* `"Add the OncoBoost Flyer and the Trial Phase III slides to the shared materials."`
    *   *Resulting State:*
        ```json
        {
          "materialsShared": [
            "OncoBoost Flyer",
            "Trial Phase III slides"
          ]
        }
        ```

### 5. `submit_interaction` (MySQL Database Persistence Tool)
*   **What it does:** Validates the current form contents and commits the log permanently to the local MySQL database.
*   **How it works:**
    1.  Executes a validation check (`validateFormFields`) to confirm all mandatory parameters (`hcpName`, `date`, `topicsDiscussed`, etc.) are filled.
    2.  If any required field is missing, blocks submission and lists the missing fields in the chat bubble.
    3.  If validation passes, runs a SQL `INSERT` statement to save the record in the `hcp_interactions` table.
    4.  Triggers a client-side reactive fetch to automatically update the **Submitted Interactions (MySQL Database)** list panel.
*   **Demo Example:**
    *   *Input:* `"submit interaction"`
    *   *Resulting State:* Writes the record to MySQL. The frontend re-fetches from `/api/agent/interactions` and updates the historical logs list instantly.

---

## 🛠️ Complete Tech Stack

*   **Frontend:** React 19, Redux Toolkit, TailwindCSS v4, motion/react (equalizer and card animations), Lucide Icons, Vite
*   **Backend:** Node.js, Express, tsx (TypeScript compiler execution)
*   **Database:** MySQL (mysql2 driver)
*   **AI Integration:** Google GenAI SDK (Gemini-3.5-Flash), Groq API (fallback router)

---

## 🚀 Running the Project Locally

### Prerequisites
*   [Node.js](https://nodejs.org/) (version 18+ recommended)
*   [MySQL Database Server](https://www.mysql.com/) (running on standard port `3306`)

### 1. Configure the Environment
Create a [`.env`](file:///e:/AI%20FORM%20FILL/.env) file in the root directory (configured with your password):

```env
# Gemini API Key for natural language parsing
GEMINI_API_KEY="YOUR_GEMINI_API_KEY_HERE"

# Local MySQL Database Credentials
DB_HOST="localhost"
DB_PORT=3306
DB_USER="root"
DB_PASSWORD="Laya@2003"
DB_NAME="hcp_crm"
```

### 2. Install Project Dependencies
Run this in your command line terminal to install all node packages:
```bash
npm install
```

### 3. Start the Server
Run the dev task:
```bash
npm run dev
```
*   The terminal will verify database connectivity:
    `[MySQL Database] Initialized successfully. Table hcp_interactions is ready.`
*   Open your web browser and navigate to: **`http://localhost:3000`** (do not use port 5500, which is for static files).

---

## 🧪 Verification Walkthrough

To verify both the database operations and agent features:
1.  Open **`http://localhost:3000`** in your browser.
2.  Click **Log: Smith Meeting** in the demo chips to automatically fill the form state.
3.  Click **Tool 4: Add Drug Samples** to append sample packages. (The application runs defensive mapping to ensure samples never crash the React layout).
4.  Type **"submit interaction"** inside the assistant input chat tray at the bottom and hit **Send**.
5.  The assistant will notify you of a successful submission:
    `Successfully submitted the HCP interaction log for Dr. Smith to the MySQL database.`
6.  Look at the bottom of the left column under **Submitted Interactions (MySQL Database)**: you will immediately see your record rendered directly from the database table!
