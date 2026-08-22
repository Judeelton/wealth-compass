Wealth Compass 💰
Psychology-Driven Budgeting & Financial Wellbeing Platform

A full-stack personal finance web app built for students and young adults who want to understand their spending - without handing over bank access to yet another automated tool.

The Problem

Most budgeting apps automate everything. That sounds convenient, but automation removes the one thing that actually changes financial behaviour: awareness. If an app silently categorises your spending in the background, you never stop to think about it.

Wealth Compass takes a different approach - lightweight friction. Not the painful kind where you manually log every purchase. Just enough friction to make you pause, reflect, and consciously tag your spending as a Need, Want, or Saving. That moment of reflection is where behaviour change happens.

How It Works
Take the FAS Assessment - 7-question Financial Anxiety Scale (Archuleta et al., 2013), scored 1–5 per question. Score stored and tracked over time, mapped to Low / Moderate / High anxiety thresholds
Set your budget - enter monthly income, adjust Need/Want/Saving percentages with interactive sliders (defaults to 50/30/20 rule)
Set up your envelopes - create named spending categories within each bucket (e.g. Rent, Groceries under Needs)
Upload your bank statement - drag and drop a PDF. Transactions are extracted in memory using pdfplumber and never saved to disk. The raw PDF is discarded immediately after parsing
Tag your transactions - Smart Batch Tagging groups repeated merchants first for bulk tagging. Individual transactions are tagged as Need, Want, or Saving and assigned to an envelope
See the full picture - dashboard with total spent, Need/Want/Saving breakdown, category bar chart, donut chart, envelope health bars, and FAS score
Get insights - AI-generated behavioural insight cards based on actual spending patterns
Download your report - PDF summary of the month's spending and insights
Why No Bank API?

Privacy. Connecting directly to your bank means handing read access to a third party. Wealth Compass never touches your bank - you export a PDF statement yourself and upload it. Transactions are extracted in memory only. The raw PDF is never stored.

Tech Stack

Frontend

React 18 + Vite
Tailwind CSS
Recharts
React Router

Backend

FastAPI (Python 3.12)
PostgreSQL
SQLAlchemy + Alembic
pdfplumber (PDF parsing)
ReportLab + Matplotlib (PDF report generation)

Auth

JWT (python-jose)
bcrypt password hashing (passlib)

Dev Tools

VS Code, Claude Code, pgAdmin, Git, GitHub
What I Built

The core product thinking, UX flow, and behavioural psychology framing are original. Specifically:

PDF parsing logic - bank statement formats are not standardised. The Lloyds parser handles OCR corruption (e.g. "D0ate" instead of "Date"), multi-line descriptions, and column-position-based debit/credit detection. The Barclays parser tracks a rolling current_date variable because Barclays groups multiple transactions under a single date header. A universal fallback parser handles other formats across four date patterns
Smart Batch Tagging - groups repeated merchants by name, presents them first for bulk tagging, applies threshold logic to determine grouping
Envelope budgeting system - three-column allocation directly mapped to the 50/30/20 framework
FAS assessment - fully implemented: 7 questions, scoring, anxiety level derivation, stored in PostgreSQL, displayed on dashboard with colour coding and history
Full API and database design - routes, auth flow, schema, migrations
Full frontend - every page, component, and data flow built from scratch

Libraries handled HTTP routing (FastAPI), ORM (SQLAlchemy), PDF binary extraction (pdfplumber), chart rendering (Recharts), and styling (Tailwind).

Supported Banks
✅ Lloyds Bank
✅ Barclays
🔄 Halifax, Revolut, Monzo - coming soon
Academic Framework

The behavioural design is grounded in peer-reviewed research:

Archuleta, Dale & Spann (2013) - Financial Anxiety Scale (FAS)
Thaler's Mental Accounting Theory - envelope budgeting
50/30/20 Rule - budget allocation framework
Self-Determination Theory (Deci & Ryan) - intrinsic motivation in behaviour change
Mullainathan & Shafir - Scarcity Mindset
Norman's Reflective Pause - the theory behind intentional friction
Getting Started
Prerequisites
Python 3.12+
Node.js 18+
PostgreSQL
Backend Setup
bash
cd backend
python -m venv venv
.\venv\Scripts\activate        # Windows
source venv/bin/activate       # Mac/Linux
pip install -r requirements.txt
uvicorn app.main:app --reload
Frontend Setup
bash
cd frontend
npm install
npm run dev
Environment Variables

Create a .env file in /backend:

DATABASE_URL=postgresql://username:password@localhost/wealthcompass
SECRET_KEY=your-secret-key
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
Project Status

Currently running locally - deployment planned.

✅ Phase 1 - Core budgeting, tagging, envelope system, FAS assessment
✅ Phase 2 - Bug fixes, transaction date handling, UI polish
🔄 Phase 3 - Additional bank parsers (Halifax, Revolut, Monzo)
🔄 Phase 4 - Merchant memory feature
🔄 Phase 5 - AI-powered insights via Anthropic API, mobile responsive design
Developer

Built by Jude Elton as a BSc Computer Science dissertation project (First Class Honours, University of East London, 2026).
