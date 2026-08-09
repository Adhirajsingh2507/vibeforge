"""Mock financial profile.

Stands in for Account Aggregator / Plaid / Setu. Every number here is fake but
internally consistent, so the deterministic engine produces defensible answers.
"""

PROFILE = {
    "name": "Adhiraj",
    "monthly_income": 60000,
    "savings_balance": 180000,
    "emergency_fund": 75000,
    "credit_score": 762,
    "currency": "INR",
}

# One month of spend, categorised. Totals ~Rs.42k against Rs.60k income, so
# disposable income is ~Rs.18k -- matching the project brief's example. Restaurant
# spend is kept above Rs.6k so the Budget agent's overspend flag fires.
TRANSACTIONS = [
    {"date": "2026-07-01", "merchant": "Rent - Landlord",      "category": "housing",       "amount": 15000},
    {"date": "2026-07-02", "merchant": "BigBasket",            "category": "groceries",     "amount": 4200},
    {"date": "2026-07-03", "merchant": "Swiggy",               "category": "restaurants",   "amount": 2400},
    {"date": "2026-07-05", "merchant": "HDFC Card EMI",        "category": "emi",           "amount": 8000},
    {"date": "2026-07-06", "merchant": "CESC Electricity",     "category": "utilities",     "amount": 2500},
    {"date": "2026-07-08", "merchant": "Zomato",               "category": "restaurants",   "amount": 2100},
    {"date": "2026-07-10", "merchant": "Uber",                 "category": "transport",     "amount": 1500},
    {"date": "2026-07-12", "merchant": "Apollo Pharmacy",      "category": "healthcare",    "amount": 1200},
    {"date": "2026-07-15", "merchant": "LIC Premium",          "category": "insurance",     "amount": 4500},
    {"date": "2026-07-19", "merchant": "Swiggy",               "category": "restaurants",   "amount": 1800},
    {"date": "2026-07-20", "merchant": "Netflix + Spotify",    "category": "subscriptions", "amount": 850},
]

# Upcoming obligations in the next billing cycle.
UPCOMING_BILLS = [
    {"name": "Rent",              "due_date": "2026-08-01", "amount": 15000, "autopay": False},
    {"name": "HDFC Card EMI",     "due_date": "2026-08-05", "amount": 8000,  "autopay": True},
    {"name": "Electricity",       "due_date": "2026-08-06", "amount": 2500,  "autopay": False},
    {"name": "LIC Premium",       "due_date": "2026-08-15", "amount": 4500,  "autopay": True},
]

INVESTMENTS = [
    {"instrument": "Mutual Funds (SIP)", "value": 230000, "monthly_contribution": 10000, "liquid": True},
    {"instrument": "Direct Stocks",      "value": 110000, "monthly_contribution": 0,     "liquid": True},
    {"instrument": "PPF",                "value": 145000, "monthly_contribution": 0,     "liquid": False},
]

# Toy fraud intelligence. In production this is a threat-intel feed; for the
# demo it makes the Fraud Agent's verdicts reproducible on stage.
TRUSTED_MERCHANTS = {
    "apple store", "apple.com", "amazon", "amazon.in", "flipkart",
    "croma", "reliance digital", "bigbasket", "swiggy", "zomato",
}

SUSPICIOUS_PATTERNS = [
    "-sale", "-offer", "%off", "90off", "loot", "free", "winner", "prize",
    "verify-", "kyc-update", "refund-", "-login", "bit.ly", "tinyurl",
]

SUSPICIOUS_TLDS = [".xyz", ".top", ".click", ".buzz", ".tk", ".ml", ".gq", ".cf"]

KNOWN_BAD = {
    "apple-sale-90off.xyz",
    "hdfc-kyc-update.top",
    "upi-refund-verify.click",
}
