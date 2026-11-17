# Aussie Citizenship Test Practice

A free, no-install practice app for the Australian citizenship test: 200 questions with a reason for every answer, a mock test in the real format, and a Jools vs Holly leaderboard.

## Put it online with GitHub Pages (5 minutes)

1. Create a new repository on GitHub (e.g. `citizenship-quiz`). Public is easiest for Pages.
2. Upload every file in this folder (`index.html`, `app.js`, `questions.js`, `style.css`, `README.md`, `.nojekyll`).
3. Go to **Settings > Pages**, set **Source** to *Deploy from a branch*, choose `main` and `/ (root)`, and Save.
4. After a minute your site is live at `https://<your-username>.github.io/citizenship-quiz/`. Send that link to Holly.

## How the mock test matches the real one

| | Real test | This app |
|---|---|---|
| Questions | 20 multiple choice | 20 multiple choice |
| Time | 45 minutes | 45 minutes (auto-submits) |
| Pass | 75% (15/20) **and** all 5 values questions correct | Same rule |
| Values questions | 5 of the 20 | 5 of the 20 |
| Other 15 | Not published per section | 5 each from the 3 other sections (assumption) |

## Where the questions come from

The real test's 200-question pool is **confidential**, so the real questions can't be copied. All 200 questions here are **original**, written from the facts in the official booklet *Australian Citizenship: Our Common Bond* (Department of Home Affairs, 2020), which the test is based on:
https://immi.homeaffairs.gov.au/citizenship-subsite/files/our-common-bond-testable.pdf

Split: 50 Australia and its people, 50 democratic beliefs/rights/liberties, 50 government and the law, 50 Australian values.

## Leaderboard

Scores are saved in each person's own browser. To combine two phones, open **Leaderboard**, tap **Copy my code** on one device, paste it into the other and tap **Merge**. Do it both ways.

## Edit the questions

Open `questions.js`. Each question is one line: `Q(category, question, CORRECT answer, wrong1, wrong2, wrong3, reason)`. Options are shuffled automatically.

*Unofficial study aid. Not affiliated with the Department of Home Affairs.*
