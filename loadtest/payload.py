"""Canonical $7,336.55 fortnight payload for the load test.

Lifted verbatim from backend/tests/test_v311_payslip.py so the request shape is
guaranteed correct against the live FastAPI schema.
"""

CALCULATE_PAYLOAD = {
    "fortnightStart": "2026-03-22",
    "rosterLine": 8,
    "publicHolidays": ["2026-04-03", "2026-04-04"],
    "isShortFortnight": True,
    "days": [
        {"date": "2026-03-22", "dow": 0, "diag": "OFF",  "aStart": "", "aEnd": ""},
        {"date": "2026-03-23", "dow": 1, "diag": "OFF",  "aStart": "", "aEnd": ""},
        {"date": "2026-03-24", "dow": 2, "diag": "3154",
         "rStart": "01:51", "rEnd": "11:21", "aStart": "03:20", "aEnd": "11:20",
         "km": 254.109, "claimLiftupLayback": True},
        {"date": "2026-03-25", "dow": 3, "diag": "3155",
         "rStart": "02:27", "rEnd": "10:32", "aStart": "01:06", "aEnd": "09:06",
         "km": 254.109, "claimLiftupLayback": True},
        {"date": "2026-03-26", "dow": 4, "diag": "3157",
         "rStart": "03:11", "rEnd": "12:41", "aStart": "04:41", "aEnd": "12:42",
         "km": 127.489, "claimLiftupLayback": True},
        {"date": "2026-03-27", "dow": 5, "diag": "3156",
         "rStart": "02:42", "rEnd": "11:41", "aStart": "04:20", "aEnd": "12:42",
         "km": 127.489, "claimLiftupLayback": True},
        {"date": "2026-03-28", "dow": 6, "diag": "3652",
         "rStart": "04:43", "rEnd": "12:58", "aStart": "12:00", "aEnd": "20:00",
         "km": 254.109, "claimLiftupLayback": True},
        {"date": "2026-03-29", "dow": 0, "diag": "WOBOD",
         "aStart": "13:30", "aEnd": "21:30", "km": 0, "wobod": True},
        {"date": "2026-03-30", "dow": 1, "diag": "WOBOD",
         "aStart": "09:13", "aEnd": "18:08", "km": 0, "wobod": True, "wasAdo": True},
        {"date": "2026-03-31", "dow": 2, "diag": "3151",
         "rStart": "09:13", "rEnd": "18:08", "aStart": "09:13", "aEnd": "18:08",
         "km": 254.109, "claimLiftupLayback": False},
        {"date": "2026-04-01", "dow": 3, "diag": "3152",
         "rStart": "09:13", "rEnd": "18:08", "aStart": "09:13", "aEnd": "18:08",
         "km": 0, "claimLiftupLayback": False},
        {"date": "2026-04-02", "dow": 4, "diag": "3153",
         "rStart": "09:13", "rEnd": "18:08", "aStart": "09:13", "aEnd": "18:08",
         "km": 181.954, "claimLiftupLayback": False},
        {"date": "2026-04-03", "dow": 5, "diag": "PHNW",
         "ph": True, "leaveCat": "PHNW", "aStart": "", "aEnd": ""},
        {"date": "2026-04-04", "dow": 6, "diag": "PHNW",
         "ph": True, "leaveCat": "PHNW", "aStart": "", "aEnd": ""},
    ],
}
