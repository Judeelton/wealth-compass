# Wealth Compass 💰

A personal finance web app built to help students and young adults build a healthier relationship with money — without handing over bank access to yet another automated tool.

## The Problem

Most budgeting apps automate everything. That sounds convenient, but automation removes the one thing that actually changes financial behaviour: awareness. If an app silently categorises your spending in the background, you never stop to think about it.

Wealth Compass takes a different approach — **lightweight friction**. Not the painful kind where you manually log every coffee purchase. Just enough friction to make you pause, reflect, and consciously tag your spending as a Need, Want, or Saving. That moment of reflection is where the behaviour change happens.

## How It Works

1. **Take the FAS Assessment** — measures your financial anxiety level using the validated Archuleta et al. (2013) Financial Anxiety Scale
2. **Set your budget** — income input with interactive 50/30/20 sliders across Needs, Wants, and Savings
3. **Set up your envelopes** — allocate named spending categories across your three buckets
4. **Upload your bank statement** — drag and drop a PDF, transactions are extracted in memory and never stored as a file
5. **Tag your transactions** — mark each one as a Need, Want, or Saving and assign it to an envelope
6. **See the full picture** — dashboard with spending breakdowns, envelope health, and your FAS score over time
7. **Get insights** — behavioural insight cards that flag where money is leaking, where you're on track, and what to watch

## Why No Bank API?

Privacy. Connecting an app directly to your bank account means handing over read access to a third party. Wealth Compass never touches your bank — you export a PDF statement yourself and upload it. Transactions are extracted in memory using pdfplumber and only the structured data is stored. The raw PDF is never saved.

## Tech Stack

**Frontend**
- React + Vite
- Tailwind CSS
- Recharts

**Backend**
- FastAPI (Python)
- PostgreSQL
- SQLAlchemy + Alembic
- pdfplumber (PDF parsing)
- ReportLab + Matplotlib (PDF reports)

**Auth**
- JWT authentication
- bcrypt password hashing

## Supported Banks
- Lloyds Bank
- Barclays
- *(Halifax, Revolut, Monzo — coming soon)*

## Academic Framework

The behavioural design of Wealth Compass is grounded in:
- **Archuleta, Dale & Spann (2013)** — Financial Anxiety Scale (FAS)
- **Thaler's Mental Accounting Theory** — envelope budgeting
- **50/30/20 Rule** — budget allocation framework
- **Self-Determination Theory** (Deci & Ryan) — intrinsic motivation in behaviour change
- **Mullainathan & Shafir** — Scarcity Mindset
- **Norman's Reflective Pause** — the theory behind intentional friction

## Getting Started

### Prerequisites
- Python 3.12+
- Node.js 18+
- PostgreSQL

### Backend Setup
```bash
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

### Environment Variables
Create a `.env` file in `/backend` with:
```env
DATABASE_URL=postgresql://username:password@localhost/wealthcompass
SECRET_KEY=your-secret-key
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

## Project Status

Actively being upgraded from dissertation project to production-ready product.

- ✅ Phase 1 — Bug fixes and UI polish
- 🔄 Phase 2 — Additional bank parsers (Halifax, Revolut, Monzo)
- 🔄 Phase 3 — Professional UI/UX redesign
- 🔄 Phase 4 — AI-powered insights via Anthropic API
- 🔄 Phase 5 — Mobile responsive design

## Developer

Built by **Jude Elton** as a BSc Computer Science project.

[GitHub](https://github.com/Judeelton/wealth-compass) · [LinkedIn](www.linkedin.com/in/judeelton)
